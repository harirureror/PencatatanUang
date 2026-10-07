import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { receipts, transactions, type ReceiptRow } from "@/db/schema";
import { MAX_RECEIPTS_PER_TRANSACTION } from "@/lib/image";
import type { Receipt } from "@/lib/types";
import { sniffImageType } from "@/server/receipt-files";
import {
  deleteReceiptFile,
  isStoredKey,
  receiptKey,
  saveReceiptFile,
} from "@/server/receipt-storage";

// Akses lampiran hanya untuk pemilik akun. Semua akses tabel receipts lewat modul ini, dan
// setiap fungsi menerima userId lalu menyaring lewat transactions.user_id. Lampiran milik
// orang lain diperlakukan sama dengan yang tidak ada (null / 404), supaya keberadaannya tidak
// bocor. File disimpan di luar /public dan hanya dilayani /api/receipts/:id/file.

/** URL foto untuk klien: file tersimpan dilayani API (cek pemilik); data contoh apa adanya. */
export function receiptFileUrl(row: Pick<ReceiptRow, "id" | "fileUrl">): string {
  return isStoredKey(row.fileUrl) ? `/api/receipts/${row.id}/file` : row.fileUrl;
}

export function toReceipt(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    transactionId: row.transactionId,
    fileUrl: receiptFileUrl(row),
    fileName: row.fileName,
    uploadedAt: row.uploadedAt,
  };
}

/** Isi file ternyata bukan foto yang didukung, atau batas jumlah terlampaui. */
export class ReceiptRejectedError extends Error {}

async function readImage(file: File): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImageType(bytes);
  if (!mimeType) {
    throw new ReceiptRejectedError(`"${file.name}" bukan foto JPG, PNG, WEBP, atau HEIC.`);
  }
  return { bytes, mimeType };
}

/**
 * Periksa isi foto sebelum menyimpan transaksinya, supaya transaksi tidak terlanjur
 * tersimpan lalu fotonya ditolak (pengguna menyimpan ulang → catatan ganda).
 * @returns pesan galat, atau null bila semua foto valid.
 */
export async function checkReceiptContent(files: File[]): Promise<string | null> {
  try {
    await Promise.all(files.map(readImage));
    return null;
  } catch (error) {
    if (error instanceof ReceiptRejectedError) return error.message;
    throw error;
  }
}

/** Transaksi milik pengguna → id-nya; null bila tidak ada / milik orang lain. */
async function ownedTransactionId(userId: string, transactionId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId), isNull(transactions.deletedAt)),
    )
    .limit(1);
  return row?.id ?? null;
}

/** Jumlah foto bukti transaksi milik pengguna (0 bila transaksi bukan miliknya). */
export async function countReceipts(userId: string, transactionId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(receipts)
    .innerJoin(transactions, eq(transactions.id, receipts.transactionId))
    .where(
      and(
        eq(receipts.transactionId, transactionId),
        eq(transactions.userId, userId),
        isNull(receipts.deletedAt),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Simpan foto bukti untuk transaksi milik pengguna: file ke penyimpanan, metadata ke tabel
 * receipts (trigger mengisi has_receipt & melepas tanda "tanpa struk").
 * Semua atau tidak sama sekali — bila satu gagal, file yang sudah tertulis dihapus lagi.
 * @returns null bila transaksi tidak ditemukan.
 */
export async function addReceipts(
  userId: string,
  transactionId: string,
  files: File[],
): Promise<Receipt[] | null> {
  if (!(await ownedTransactionId(userId, transactionId))) return null;
  if (files.length === 0) return [];

  if ((await countReceipts(userId, transactionId)) + files.length > MAX_RECEIPTS_PER_TRANSACTION) {
    throw new ReceiptRejectedError(
      `Maksimal ${MAX_RECEIPTS_PER_TRANSACTION} foto untuk satu transaksi.`,
    );
  }

  const prepared = await Promise.all(
    files.map(async (file) => {
      const { bytes, mimeType } = await readImage(file);
      const id = crypto.randomUUID();
      return {
        bytes,
        row: {
          id,
          transactionId,
          fileUrl: receiptKey(transactionId, id, mimeType),
          fileName: file.name.slice(0, 200) || "struk",
          mimeType,
          sizeBytes: bytes.byteLength,
        },
      };
    }),
  );

  const written: string[] = [];
  try {
    for (const p of prepared) {
      await saveReceiptFile(p.row.fileUrl, p.bytes);
      written.push(p.row.fileUrl);
    }
    const rows = await db.insert(receipts).values(prepared.map((p) => p.row)).returning();
    return rows.map(toReceipt);
  } catch (error) {
    await Promise.all(written.map((key) => deleteReceiptFile(key).catch(() => {})));
    throw error;
  }
}

/** Lampiran satu transaksi milik pengguna, urut waktu unggah. null bila transaksi tidak ada. */
export async function listReceipts(userId: string, transactionId: string): Promise<Receipt[] | null> {
  if (!(await ownedTransactionId(userId, transactionId))) return null;
  const rows = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.transactionId, transactionId), isNull(receipts.deletedAt)))
    .orderBy(asc(receipts.uploadedAt));
  return rows.map(toReceipt);
}

/** Metadata satu lampiran milik pengguna (untuk melayani file-nya). */
export async function getOwnedReceipt(userId: string, receiptId: string): Promise<ReceiptRow | null> {
  const [row] = await db
    .select({ receipt: receipts })
    .from(receipts)
    .innerJoin(transactions, eq(transactions.id, receipts.transactionId))
    .where(
      and(
        eq(receipts.id, receiptId),
        eq(transactions.userId, userId),
        isNull(receipts.deletedAt),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1);
  return row?.receipt ?? null;
}

/** Batas id per permintaan daftar lampiran (daftar transaksi dimuat per halaman). */
export const MAX_RECEIPT_LOOKUP_IDS = 500;

/**
 * Lampiran banyak transaksi sekaligus (untuk daftar & dashboard), dikelompokkan per id
 * transaksi dan urut waktu unggah. Transaksi milik pengguna lain diabaikan.
 */
export async function getReceiptsByTransaction(
  userId: string,
  transactionIds: string[],
): Promise<Record<string, Receipt[]>> {
  const ids = [...new Set(transactionIds)].slice(0, MAX_RECEIPT_LOOKUP_IDS);
  if (ids.length === 0) return {};
  const rows = await db
    .select({ receipt: receipts })
    .from(receipts)
    .innerJoin(transactions, eq(transactions.id, receipts.transactionId))
    .where(
      and(
        inArray(receipts.transactionId, ids),
        eq(transactions.userId, userId),
        isNull(receipts.deletedAt),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(asc(receipts.uploadedAt));
  const grouped: Record<string, Receipt[]> = {};
  for (const { receipt } of rows) (grouped[receipt.transactionId] ??= []).push(toReceipt(receipt));
  return grouped;
}

/** Kunci file tersimpan milik satu transaksi pengguna — dibaca sebelum transaksinya dihapus. */
export async function storedReceiptKeys(userId: string, transactionId: string): Promise<string[]> {
  const rows = await db
    .select({ fileUrl: receipts.fileUrl })
    .from(receipts)
    .innerJoin(transactions, eq(transactions.id, receipts.transactionId))
    .where(
      and(
        eq(receipts.transactionId, transactionId),
        eq(transactions.userId, userId),
        isNull(receipts.deletedAt),
      ),
    );
  return rows.map((r) => r.fileUrl).filter(isStoredKey);
}

/** Hapus file di penyimpanan; kegagalan dicatat saja (baris DB sudah terhapus). */
export async function deleteStoredFiles(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      deleteReceiptFile(key).catch((error) => console.error("Gagal menghapus file struk:", key, error)),
    ),
  );
}

/**
 * Tandai / lepas status "tanpa struk". Tanda tidak dipasang bila transaksi sudah punya foto
 * (trigger database juga menolaknya); melepas tanda selalu boleh.
 * @returns status akhir, atau null bila transaksi tidak ditemukan.
 */
export async function setNoReceipt(
  userId: string,
  transactionId: string,
  flagged: boolean,
): Promise<{ noReceipt: boolean; hasReceipt: boolean } | null> {
  const owned = and(
    eq(transactions.id, transactionId),
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
  );
  await db
    .update(transactions)
    .set({ noReceipt: flagged })
    .where(flagged ? and(owned, eq(transactions.hasReceipt, false)) : owned);
  const [row] = await db
    .select({ noReceipt: transactions.noReceipt, hasReceipt: transactions.hasReceipt })
    .from(transactions)
    .where(owned)
    .limit(1);
  return row ?? null;
}
