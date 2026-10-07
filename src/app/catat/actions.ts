"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { toReturnPath } from "@/lib/return-path";
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
    if (photos.files.length > 0) await addReceipts(userId, created.id, photos.files);
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
    if (photos.files.length > 0) await addReceipts(userId, existing.id, photos.files);
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
