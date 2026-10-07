// Aturan isian transaksi — fungsi murni yang dipakai server (Route Handler / Server Action)
// dan perangkat (catat saat offline), sehingga keduanya menolak hal yang sama.
import type { Category, TransactionType } from "@/lib/types";

export type TransactionField = "amount" | "categoryId" | "transactionDate" | "description";
export type FieldErrors = Partial<Record<TransactionField, string>>;

export type TransactionInput = {
  amount: number;
  categoryId: string;
  transactionDate: string;
  description: string;
};

export const MAX_AMOUNT = 999_999_999_999; // 12 digit, sama dengan batas input di form
export const MAX_DESCRIPTION = 200;

export const TRANSACTION_MESSAGES: Record<TransactionType, { amount: string; category: string }> = {
  expense: {
    amount: "Isi jumlah uang yang dikeluarkan.",
    category: "Pilih kategori pengeluaran.",
  },
  income: {
    amount: "Isi jumlah uang yang diterima.",
    category: "Pilih sumber dana.",
  },
};

/** Nominal dari JSON (angka bulat) atau isian form ("150.000" → 150000). */
export function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isInteger(value) ? value : NaN;
  if (typeof value === "string" && /\d/.test(value)) return Number(value.replace(/\D/g, ""));
  return NaN;
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value); // tolak 2026-02-30
}

/**
 * Periksa isian transaksi.
 * @param category kategori yang dipilih (sudah dicari pemanggil), null bila tidak ditemukan
 * @param today hari ini (YYYY-MM-DD) — tanggal transaksi tidak boleh melewatinya
 */
export function checkTransactionFields(
  type: TransactionType,
  raw: Record<string, unknown>,
  category: Pick<Category, "type"> | null,
  today: string,
): { data: TransactionInput } | { errors: FieldErrors } {
  const errors: FieldErrors = {};

  const amount = parseAmount(raw.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    errors.amount = TRANSACTION_MESSAGES[type].amount;
  }

  const categoryId = typeof raw.categoryId === "string" ? raw.categoryId : "";
  if (!categoryId || !category || category.type !== type) {
    errors.categoryId = TRANSACTION_MESSAGES[type].category;
  }

  const transactionDate = typeof raw.transactionDate === "string" ? raw.transactionDate : "";
  if (!isValidISODate(transactionDate)) {
    errors.transactionDate = "Tanggal tidak valid.";
  } else if (transactionDate > today) {
    errors.transactionDate = "Tanggal tidak boleh melewati hari ini.";
  }

  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (description.length > MAX_DESCRIPTION) {
    errors.description = `Keterangan maksimal ${MAX_DESCRIPTION} huruf.`;
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { data: { amount, categoryId, transactionDate, description } };
}

/** Kolom lama ditimpa kolom yang dikirim — dasar validasi perubahan sebagian. */
export function mergeTransactionChanges(
  existing: TransactionInput,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const field of ["amount", "categoryId", "transactionDate", "description"] as const) {
    if (raw[field] !== undefined) merged[field] = raw[field];
  }
  return merged;
}
