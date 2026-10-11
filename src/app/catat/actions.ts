"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { strukHref, toReturnPath } from "@/lib/return-path";
import type { TransactionType } from "@/lib/types";
import { getCurrentUserId } from "@/server/current-user";
import { readReceiptFiles } from "@/server/receipt-files";
import {
  addReceipts,
  checkReceiptContent,
  countReceipts,
  ReceiptRejectedError,
  setNoReceipt,
} from "@/server/receipts";
import {
  createTransaction as saveNewTransaction,
  deleteTransaction as removeTransaction,
  getTransaction,
  NoActiveProjectError,
  TransactionConflictError,
  updateTransaction as saveTransaction,
  validateTransactionChanges,
  validateTransactionInput,
  type TransactionField,
} from "@/server/transactions";

export type TransactionFormState = {
  errors?: Partial<Record<TransactionField | "receipts" | "form", string>>;
};

const NOT_FOUND = "Catatan tidak ditemukan. Mungkin sudah dihapus.";

/** Foto dari form: jumlah/ukuran/tipe, lalu isi file — semua dicek sebelum apa pun disimpan. */
async function readPhotos(formData: FormData, existingCount = 0) {
  const photos = readReceiptFiles(formData, existingCount);
  if ("error" in photos) return photos;
  const contentError = await checkReceiptContent(photos.files);
  return contentError ? { error: contentError } : photos;
}

/**
 * Simpan foto ke catatan yang SUDAH tersimpan. Bila gagal (penyimpanan berkas bermasalah, foto
 * ditolak), catatannya tidak dibatalkan: pengguna dibawa ke halaman lampiran catatan itu dengan
 * penjelasan, supaya bisa mencoba lagi tanpa membuat catatan ganda — bukan halaman galat.
 */
/** Pesan galat beserta penyebabnya (mis. galat database di balik galat Drizzle). */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` ← ${error.cause.message}` : "";
  // Query SQL panjang dari Drizzle tidak berguna bagi pengguna — ambil bagian awalnya saja.
  return `${error.name}: ${error.message.replace(/\s+/g, " ").slice(0, 160)}${cause}`;
}

async function attachOrExplain(userId: string, transactionId: string, files: File[], formData: FormData) {
  try {
    await addReceipts(userId, transactionId, files);
  } catch (error) {
    const reason = error instanceof ReceiptRejectedError ? "ditolak" : "gagal";
    if (reason === "gagal") console.error("Foto struk gagal disimpan:", error);
    revalidatePath("/", "layout");
    const href = strukHref(transactionId, toReturnPath(formData.get("returnTo")));
    // redirect() melempar — pemanggil meneruskannya (galat tak dikenal dilempar ulang).
    // Detail teknis singkat ikut ditampilkan agar penyebabnya bisa dilaporkan (tanpa nilai rahasia:
    // pesan galat penyimpanan / database hanya memuat kunci berkas & kode galat).
    const detail = reason === "gagal" ? `&detail=${encodeURIComponent(describeError(error).slice(0, 300))}` : "";
    redirect(`${href}${href.includes("?") ? "&" : "?"}foto=${reason}${detail}`);
  }
}

/**
 * Setelah transaksi berubah, saldo dihitung ulang dari database di setiap halaman —
 * jadi segarkan seluruh aplikasi (layout akar), bukan hanya halaman tujuan.
 */
function finish(formData: FormData): never {
  revalidatePath("/", "layout");
  redirect(toReturnPath(formData.get("returnTo")));
}

export async function createTransaction(
  _prev: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const userId = await getCurrentUserId();
  const type: TransactionType = formData.get("type") === "income" ? "income" : "expense";
  const result = await validateTransactionInput(userId, type, Object.fromEntries(formData));
  const photos = await readPhotos(formData);
  if ("errors" in result || "error" in photos) {
    return {
      errors: {
        ...("errors" in result ? result.errors : {}),
        ...("error" in photos ? { receipts: photos.error } : {}),
      },
    };
  }

  try {
    // Tanda "tanpa struk" hanya berlaku tanpa foto; bila ada foto, trigger melepasnya.
    const created = await saveNewTransaction(userId, type, result.data, undefined, {
      noReceipt: formData.get("noReceipt") === "on" && photos.files.length === 0,
    });
    if (photos.files.length > 0) await attachOrExplain(userId, created.id, photos.files, formData);
  } catch (error) {
    if (error instanceof NoActiveProjectError) return { errors: { form: error.message } };
    if (error instanceof TransactionConflictError) return { errors: error.fieldErrors };
    throw error;
  }
  finish(formData);
}

export async function updateTransaction(
  _prev: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const userId = await getCurrentUserId();
  const existing = await getTransaction(userId, String(formData.get("id") ?? ""));
  if (!existing) return { errors: { form: NOT_FOUND } };

  // Jenis transaksi tidak diubah di sini — kategori bergantung pada jenisnya.
  const { amount, categoryId, transactionDate, description } = Object.fromEntries(formData);
  const result = await validateTransactionChanges(userId, existing, {
    amount,
    categoryId,
    transactionDate,
    description,
  });
  const photos = await readPhotos(formData, await countReceipts(userId, existing.id));
  if ("errors" in result || "error" in photos) {
    return {
      errors: {
        ...("errors" in result ? result.errors : {}),
        ...("error" in photos ? { receipts: photos.error } : {}),
      },
    };
  }

  try {
    const saved = await saveTransaction(userId, existing, result.data);
    if (!saved) return { errors: { form: NOT_FOUND } };
    if (photos.files.length > 0) await attachOrExplain(userId, existing.id, photos.files, formData);
    await setNoReceipt(userId, existing.id, formData.get("noReceipt") === "on");
  } catch (error) {
    if (error instanceof TransactionConflictError) return { errors: error.fieldErrors };
    if (error instanceof ReceiptRejectedError) return { errors: { receipts: error.message } };
    throw error;
  }
  finish(formData);
}

export async function deleteTransaction(formData: FormData): Promise<void> {
  // Bila catatan sudah tidak ada (mis. dihapus di tab lain), cukup kembali ke daftar.
  await removeTransaction(await getCurrentUserId(), String(formData.get("id") ?? ""));
  finish(formData);
}
