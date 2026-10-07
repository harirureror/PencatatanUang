// Operasi tulis transaksi yang dipakai bersama oleh REST (POST/PATCH/DELETE /api/transactions)
// dan push sinkron (POST /api/sync/push). Hasilnya berupa nilai, bukan Response, beserta kode
// HTTP padanannya — jadi aturan validasi, idempotensi, dan deteksi bentrok hanya ada di satu tempat.
import type { Transaction } from "@/lib/types";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  getTransactionUpdatedAt,
  isClientId,
  NoActiveProjectError,
  ProjectUnavailableError,
  TransactionConflictError,
  TransactionIdTakenError,
  updateTransaction,
  validateTransactionChanges,
  validateTransactionInput,
} from "@/server/transactions";

/**
 * Hasil resolusi bentrok last-write-wins:
 * - "device-wins": perubahan perangkat lebih baru → diterapkan menimpa versi server;
 * - "server-wins": versi server lebih baru → perubahan perangkat tidak diterapkan.
 */
export type Resolution = "device-wins" | "server-wins";

export type OpResult =
  | { status: "applied"; http: 200 | 201; data: Transaction; replayed?: boolean; resolution?: Resolution }
  | { status: "invalid"; http: 400 | 422; error: string; fieldErrors?: Record<string, string> }
  /** Isi di server sudah berbeda dari `base` dan versi server lebih baru (server menang). */
  | { status: "conflict"; http: 409; error: string; data: Transaction; resolution: Resolution }
  /** Tidak bisa disimpan saat ini (belum ada proyek aktif / id dipakai pengguna lain). */
  | { status: "unavailable"; http: 409; error: string }
  | { status: "not_found"; http: 404; error: string };

const NOT_FOUND: OpResult = { status: "not_found", http: 404, error: "Catatan tidak ditemukan." };
const invalid = (fieldErrors: Record<string, string>): OpResult => ({
  status: "invalid",
  http: 422,
  error: "Isian tidak valid.",
  fieldErrors,
});

/** Isi catatan sama dengan `base` kiriman perangkat (kolom yang bisa diubah saja). */
export function sameContent(tx: Transaction, base: unknown): boolean {
  if (!base || typeof base !== "object") return false;
  const b = base as Record<string, unknown>;
  return (
    b.amount === tx.amount &&
    b.categoryId === tx.categoryId &&
    b.transactionDate === tx.transactionDate &&
    (typeof b.description === "string" ? b.description.trim() : "") === tx.description
  );
}

/**
 * Waktu perubahan dibuat di perangkat, dalam jam server. Perangkat mengirim `editedAt` (jam
 * perangkat saat mengubah) dan `sentAt` (jam perangkat saat mengirim); selisih sentAt dengan
 * jam server dipakai mengoreksi jam perangkat yang salah. Null bila editedAt tidak ada.
 */
export function deviceEditTime(
  clock: { editedAt?: unknown; sentAt?: unknown },
  serverNow = Date.now(),
): number | null {
  const edited = typeof clock.editedAt === "string" ? Date.parse(clock.editedAt) : NaN;
  if (Number.isNaN(edited)) return null;
  const sent = typeof clock.sentAt === "string" ? Date.parse(clock.sentAt) : NaN;
  const skew = Number.isNaN(sent) ? 0 : serverNow - sent;
  return Math.min(edited + skew, serverNow);
}

/**
 * Catat transaksi baru. `raw.id` (UUID buatan perangkat) membuatnya idempoten: kiriman ulang
 * mengembalikan catatan yang sama. `raw.projectId` = proyek tempat dicatat (antrean offline).
 */
export async function applyCreate(userId: string, raw: Record<string, unknown>): Promise<OpResult> {
  const type = raw.type ?? "expense";
  if (type !== "expense" && type !== "income") {
    return invalid({ type: 'Jenis harus "expense" atau "income".' });
  }
  if (raw.id !== undefined && !isClientId(raw.id)) {
    return { status: "invalid", http: 400, error: "id harus berupa UUID." };
  }
  if (raw.projectId !== undefined && (typeof raw.projectId !== "string" || !raw.projectId)) {
    return { status: "invalid", http: 400, error: "projectId harus berupa string." };
  }
  const clientId = raw.id as string | undefined;

  // Pengiriman ulang dari antrean perangkat: catatan sudah ada → kembalikan apa adanya.
  if (clientId) {
    const existing = await getTransaction(userId, clientId);
    if (existing) return { status: "applied", http: 200, data: existing, replayed: true };
  }

  const result = await validateTransactionInput(userId, type, raw);
  if ("errors" in result) return invalid(result.errors);
  try {
    const { replayed, ...data } = await createTransaction(userId, type, result.data, clientId, {
      noReceipt: raw.noReceipt === true,
      projectId: raw.projectId as string | undefined,
    });
    return replayed
      ? { status: "applied", http: 200, data, replayed: true }
      : { status: "applied", http: 201, data };
  } catch (error) {
    if (error instanceof ProjectUnavailableError) {
      return { status: "invalid", http: 422, error: error.message };
    }
    if (error instanceof NoActiveProjectError || error instanceof TransactionIdTakenError) {
      return { status: "unavailable", http: 409, error: error.message };
    }
    if (error instanceof TransactionConflictError) {
      return { status: "invalid", http: 422, error: error.message, fieldErrors: error.fieldErrors };
    }
    throw error;
  }
}

/**
 * Ubah sebagian isi catatan. `raw.base` = isi catatan saat mulai diubah di perangkat. Bila isi
 * di server sudah berbeda (diubah di perangkat lain) → resolusi last-write-wins: perubahan
 * yang dibuat paling akhir menang, dibandingkan dari `raw.editedAt` (dikoreksi `raw.sentAt`)
 * terhadap updated_at server. Tanpa editedAt (klien lama) → server menang, pengguna yang
 * memutuskan. Tanpa base (mis. "pakai versi saya") → langsung diterapkan.
 */
export async function applyUpdate(
  userId: string,
  id: string,
  raw: Record<string, unknown>,
): Promise<OpResult> {
  const existing = await getTransaction(userId, id);
  if (!existing) return NOT_FOUND;

  if (raw.type !== undefined && raw.type !== existing.type) {
    return invalid({ type: "Jenis transaksi tidak bisa diubah. Hapus lalu catat ulang." });
  }
  // Waktu perubahan perangkat & versi server, keduanya "kapan diubah" (bukan kapan tiba).
  const editedAt = deviceEditTime(raw);
  const serverUpdatedAt = await getTransactionUpdatedAt(userId, id);
  const serverTime = serverUpdatedAt ? Date.parse(serverUpdatedAt) : 0;

  let resolution: Resolution | undefined;
  if (raw.base !== undefined && !sameContent(existing, raw.base)) {
    if (editedAt === null || !serverUpdatedAt || editedAt <= serverTime) {
      return {
        status: "conflict",
        http: 409,
        error: "Catatan sudah diubah di perangkat lain setelah Anda mengubahnya.",
        data: existing,
        resolution: "server-wins",
      };
    }
    resolution = "device-wins";
  }

  const result = await validateTransactionChanges(userId, existing, raw);
  if ("errors" in result) return invalid(result.errors);
  try {
    // Versi baru bertanggal saat diubah di perangkat (tidak pernah mundur), supaya perangkat
    // yang lama offline tetap dinilai adil pada bentrok berikutnya.
    const versionAt =
      editedAt === null ? undefined : new Date(Math.max(editedAt, serverTime)).toISOString();
    const data = await updateTransaction(userId, existing, result.data, { versionAt });
    return data ? { status: "applied", http: 200, data, resolution } : NOT_FOUND;
  } catch (error) {
    if (error instanceof TransactionConflictError) return invalid(error.fieldErrors);
    throw error;
  }
}

/** Hapus catatan (soft delete). Sudah tidak ada → not_found (bagi antrean berarti selesai). */
export async function applyDelete(
  userId: string,
  id: string,
): Promise<{ status: "applied"; id: string } | typeof NOT_FOUND> {
  return (await deleteTransaction(userId, id)) ? { status: "applied", id } : NOT_FOUND;
}
