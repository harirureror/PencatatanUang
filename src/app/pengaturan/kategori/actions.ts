"use server";

import { revalidatePath } from "next/cache";

import {
  createCategoryChecked,
  deleteCategoryChecked,
  renameCategoryChecked,
  type CategoryResult,
} from "@/server/categories";
import { getCurrentUserId } from "@/server/current-user";

export type CategoryActionState = {
  error?: string;
  /** Berubah tiap kali aksi berhasil — dipakai form untuk mengosongkan isian / menutup mode ubah. */
  savedAt?: number;
};

function done(result: CategoryResult): CategoryActionState {
  if (!result.ok) return { error: result.error };
  revalidatePath("/pengaturan/kategori");
  revalidatePath("/pengaturan");
  revalidatePath("/catat");
  return { savedAt: Date.now() };
}

export async function addCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const type = formData.get("type") === "income" ? "income" : "expense";
  return done(await createCategoryChecked(await getCurrentUserId(), { name: formData.get("name"), type }));
}

export async function renameCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  return done(
    await renameCategoryChecked(await getCurrentUserId(), String(formData.get("id") ?? ""), formData.get("name")),
  );
}

export async function deleteCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  return done(await deleteCategoryChecked(await getCurrentUserId(), String(formData.get("id") ?? "")));
}
