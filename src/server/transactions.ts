import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { transactions, type TransactionRow } from "@/db/schema";
import { todayISO } from "@/lib/format";
import {
  checkTransactionFields,
  mergeTransactionChanges,
  TRANSACTION_MESSAGES as MESSAGES,
  type FieldErrors,
  type TransactionInput,
} from "@/lib/transaction-rules";
import type { Transaction, TransactionType } from "@/lib/types";
import { getCategory } from "@/server/categories";
import { getActiveProject, getProject } from "@/server/projects";
import { deleteStoredFiles, storedReceiptKeys } from "@/server/receipts";

export type { FieldErrors, TransactionField, TransactionInput } from "@/lib/transaction-rules";

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    projectId: row.projectId,
    categoryId: row.categoryId,
    type: row.type,
    amount: row.amount,
    description: row.description,
    transactionDate: row.transactionDate,
    hasReceipt: row.hasReceipt,
    noReceipt: row.noReceipt,
  };
}

/**
 * Validasi isian transaksi — dipakai bersama oleh Route Handler dan Server Action.
 * `raw` boleh berasal dari body JSON atau FormData (Object.fromEntries).
 */
export async function validateTransactionInput(
  userId: string,
  type: TransactionType,
  raw: Record<string, unknown>,
): Promise<{ data: TransactionInput } | { errors: FieldErrors }> {
  const categoryId = typeof raw.categoryId === "string" ? raw.categoryId : "";
  const category = categoryId ? await getCategory(userId, categoryId) : null;
  return checkTransactionFields(type, raw, category, todayISO());
}

export class NoActiveProjectError extends Error {
  constructor() {
    super("Belum ada proyek aktif. Pilih atau buat proyek dulu.");
  }
}

/** Proyek tujuan catatan (dari antrean offline) sudah dihapus atau diarsipkan. */
export class ProjectUnavailableError extends Error {
  constructor() {
    super("Proyek untuk catatan ini sudah dihapus atau diarsipkan.");
  }
}

export const MAX_PAGE_SIZE = 500;

export type ListOptions = { type?: TransactionType; limit?: number; offset?: number };

/** Transaksi satu proyek, terbaru dulu (tanggal transaksi, lalu urutan catat). */
export async function listTransactions(
  userId: string,
  projectId: string,
  { type, limit = MAX_PAGE_SIZE, offset = 0 }: ListOptions = {},
): Promise<{ items: Transaction[]; total: number }> {
  const where = and(
    eq(transactions.projectId, projectId),
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
    type ? eq(transactions.type, type) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt), desc(sql`rowid`))
      .limit(Math.min(limit, MAX_PAGE_SIZE))
      .offset(offset),
    db.select({ total: count() }).from(transactions).where(where),
  ]);
  return { items: rows.map(toTransaction), total };
}

/** Satu transaksi milik pengguna (null bila tidak ada / milik orang lain). */
export async function getTransaction(userId: string, id: string): Promise<Transaction | null> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .limit(1);
  return row ? toTransaction(row) : null;
}

/** updated_at catatan milik pengguna (versi terakhir di hub), null bila tidak ada. */
export async function getTransactionUpdatedAt(userId: string, id: string): Promise<string | null> {
  const [row] = await db
    .select({ updatedAt: transactions.updatedAt })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .limit(1);
  return row?.updatedAt ?? null;
}

/** Galat validasi yang baru ketahuan di database (mis. kategori terhapus sesaat sebelumnya). */
export class TransactionConflictError extends Error {
  constructor(
    type: TransactionType,
    readonly fieldErrors: FieldErrors = { categoryId: MESSAGES[type].category },
  ) {
    super("Isian tidak valid.");
  }
}

function isConstraintError(error: unknown): boolean {
  const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code ??
    (error as { code?: string })?.code;
  return typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT");
}

/**
 * Validasi perubahan sebagian: kolom yang dikirim menimpa nilai lama, lalu hasil gabungannya
 * divalidasi dengan aturan yang sama seperti saat menambah. Jenis transaksi tidak bisa diubah.
 */
export async function validateTransactionChanges(
  userId: string,
  existing: Transaction,
  raw: Record<string, unknown>,
): Promise<{ data: TransactionInput } | { errors: FieldErrors }> {
  return validateTransactionInput(userId, existing.type, mergeTransactionChanges(existing, raw));
}

/** Simpan perubahan (sudah divalidasi). Null bila catatan tidak ada / milik orang lain. */
export async function updateTransaction(
  userId: string,
  existing: Transaction,
  input: TransactionInput,
  /**
   * Waktu versi ini dibuat (perubahan dari perangkat: saat diubah di perangkat, bukan saat
   * tiba di server) — dipakai last-write-wins. Kosong = sekarang.
   */
  { versionAt }: { versionAt?: string } = {},
): Promise<Transaction | null> {
  try {
    const [row] = await db
      .update(transactions)
      .set(versionAt ? { ...input, updatedAt: versionAt } : input)
      .where(
        and(eq(transactions.id, existing.id), eq(transactions.userId, userId), isNull(transactions.deletedAt)),
      )
      .returning();
    return row ? toTransaction(row) : null;
  } catch (error) {
    if (isConstraintError(error)) throw new TransactionConflictError(existing.type);
    throw error;
  }
}

/**
 * Hapus catatan milik pengguna (soft delete: deleted_at diisi, baris tetap ada sebagai penanda
 * agar perangkat lain ikut menghapus saat sinkron). Lampirannya ikut ditandai terhapus
 * (trigger 0008) dan file fotonya dihapus dari penyimpanan.
 * False bila tidak ada / milik orang lain / sudah terhapus.
 */
export async function deleteTransaction(userId: string, id: string): Promise<boolean> {
  const keys = await storedReceiptKeys(userId, id);
  const rows = await db
    .update(transactions)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .returning({ id: transactions.id });
  if (rows.length === 0) return false;
  await deleteStoredFiles(keys);
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** ID buatan perangkat (catat offline) harus UUID agar tidak bentrok antar perangkat. */
export function isClientId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export class TransactionIdTakenError extends Error {
  constructor() {
    super("ID transaksi sudah dipakai.");
  }
}

/**
 * Simpan transaksi (sudah divalidasi) ke proyek aktif pengguna.
 * `clientId` (opsional) = ID yang dibuat perangkat saat mencatat offline. Bila ID itu sudah
 * tersimpan milik pengguna yang sama, catatan lama dikembalikan apa adanya (idempoten),
 * sehingga pengiriman ulang dari antrean tidak menggandakan transaksi.
 */
export async function createTransaction(
  userId: string,
  type: TransactionType,
  input: TransactionInput,
  clientId?: string,
  {
    noReceipt = false,
    projectId,
  }: {
    noReceipt?: boolean;
    /**
     * Proyek tujuan. Antrean offline mengirim proyek tempat catatan dibuat, supaya tidak
     * pindah ke proyek lain bila proyek aktif diganti sebelum antrean terkirim.
     * Kosong = proyek aktif saat ini.
     */
    projectId?: string;
  } = {},
): Promise<Transaction & { replayed?: boolean }> {
  if (clientId) {
    const [existing] = await db.select().from(transactions).where(eq(transactions.id, clientId)).limit(1);
    if (existing) {
      if (existing.userId !== userId) throw new TransactionIdTakenError();
      return { ...toTransaction(existing), replayed: true };
    }
  }

  let project;
  if (projectId) {
    project = await getProject(userId, projectId);
    if (!project || project.status === "arsip") throw new ProjectUnavailableError();
  } else {
    project = await getActiveProject(userId);
    if (!project) throw new NoActiveProjectError();
  }

  try {
    const [row] = await db
      .insert(transactions)
      .values({
        ...input,
        ...(clientId ? { id: clientId } : {}),
        type,
        userId,
        projectId: project.id,
        noReceipt, // has_receipt diisi trigger saat foto ditambahkan
      })
      .returning();
    return toTransaction(row);
  } catch (error) {
    // FK kategori / trigger jenis-kategori: kategori berubah di antara validasi & simpan.
    if (isConstraintError(error)) throw new TransactionConflictError(type);
    throw error;
  }
}
