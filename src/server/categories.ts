import { and, count, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, transactions, type CategoryRow } from "@/db/schema";
import type { Category, TransactionType } from "@/lib/types";

export function toCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, type: row.type, isDefault: row.isDefault };
}

// Kategori yang terlihat oleh pengguna: bawaan sistem (user_id NULL) + buatannya sendiri,
// yang belum dihapus (soft delete).
const visibleTo = (userId: string) =>
  and(or(isNull(categories.userId), eq(categories.userId, userId)), isNull(categories.deletedAt));

// "Lain-lain" bawaan selalu di urutan terakhir, setelah kategori buatan pengguna.
const isCatchAll = (c: Category) => c.isDefault && c.name === "Lain-lain";
const byDisplayOrder = (a: Category, b: Category) =>
  Number(isCatchAll(a)) - Number(isCatchAll(b)) ||
  Number(b.isDefault) - Number(a.isDefault);

export async function listCategories(userId: string, type?: TransactionType): Promise<Category[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(type ? and(visibleTo(userId), eq(categories.type, type)) : visibleTo(userId))
    .orderBy(categories.createdAt, sql`rowid`);
  return rows.map(toCategory).sort(byDisplayOrder);
}

export async function getCategory(userId: string, id: string): Promise<Category | null> {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), visibleTo(userId)))
    .limit(1);
  return row ? toCategory(row) : null;
}

/** Jumlah catatan milik pengguna yang memakai tiap kategori. */
export async function countTransactionsByCategory(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ categoryId: transactions.categoryId, n: count() })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .groupBy(transactions.categoryId);
  return new Map(rows.map((r) => [r.categoryId, r.n]));
}

export async function addCategory(
  userId: string,
  input: { name: string; type: TransactionType },
): Promise<Category> {
  const [row] = await db
    .insert(categories)
    .values({ ...input, userId, isDefault: false })
    .returning();
  return toCategory(row);
}

/** Hanya kategori buatan pengguna itu sendiri yang bisa diubah. */
export async function renameCategory(userId: string, id: string, name: string): Promise<boolean> {
  const rows = await db
    .update(categories)
    .set({ name })
    .where(
      and(
        eq(categories.id, id),
        eq(categories.userId, userId),
        eq(categories.isDefault, false),
        isNull(categories.deletedAt),
      ),
    )
    .returning({ id: categories.id });
  return rows.length > 0;
}

/**
 * Hanya kategori buatan pengguna itu sendiri. Soft delete (deleted_at diisi) agar ikut
 * tersinkron; trigger 0008 menolak bila masih dipakai catatan yang belum dihapus.
 */
export async function deleteCategory(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(categories)
    .set({ deletedAt: new Date().toISOString() })
    .where(
      and(
        eq(categories.id, id),
        eq(categories.userId, userId),
        eq(categories.isDefault, false),
        isNull(categories.deletedAt),
      ),
    )
    .returning({ id: categories.id });
  return rows.length > 0;
}

// ---- Operasi dengan aturan bisnis (dipakai server action & REST API) ----------------------

export const CATEGORY_NAME_MAX = 30;

export type CategoryResult =
  | { ok: true; category: Category }
  | { ok: false; status: 404 | 409 | 422; error: string };

const fail = (status: 404 | 409 | 422, error: string): CategoryResult => ({ ok: false, status, error });

/** Rapikan spasi berlebih. */
export const cleanCategoryName = (raw: unknown) => String(raw ?? "").trim().replace(/\s+/g, " ");

async function checkName(
  userId: string,
  name: string,
  type: TransactionType,
  exceptId?: string,
): Promise<CategoryResult | null> {
  if (!name) return fail(422, "Nama kategori belum diisi.");
  if (name.length > CATEGORY_NAME_MAX) return fail(422, `Nama kategori maksimal ${CATEGORY_NAME_MAX} huruf.`);
  const siblings = await listCategories(userId, type);
  const taken = siblings.some(
    (c) => c.id !== exceptId && c.name.toLocaleLowerCase("id") === name.toLocaleLowerCase("id"),
  );
  return taken ? fail(409, `Kategori "${name}" sudah ada.`) : null;
}

/** Bentrok indeks unik (dua perangkat menambah nama sama bersamaan). */
const isUniqueViolation = (e: unknown) =>
  e instanceof Error && /UNIQUE constraint/i.test(`${e.message} ${String((e as { cause?: unknown }).cause ?? "")}`);

export async function createCategoryChecked(
  userId: string,
  input: { name: unknown; type: unknown },
): Promise<CategoryResult> {
  if (input.type !== "income" && input.type !== "expense") return fail(422, 'Jenis harus "income" atau "expense".');
  const name = cleanCategoryName(input.name);
  const problem = await checkName(userId, name, input.type);
  if (problem) return problem;
  try {
    return { ok: true, category: await addCategory(userId, { name, type: input.type }) };
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, `Kategori "${name}" sudah ada.`);
    throw e;
  }
}

export async function renameCategoryChecked(userId: string, id: string, rawName: unknown): Promise<CategoryResult> {
  const category = await getCategory(userId, id);
  if (!category) return fail(404, "Kategori tidak ditemukan.");
  if (category.isDefault) return fail(422, "Kategori bawaan tidak bisa diubah.");
  const name = cleanCategoryName(rawName);
  const problem = await checkName(userId, name, category.type, category.id);
  if (problem) return problem;
  try {
    await renameCategory(userId, category.id, name);
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, `Kategori "${name}" sudah ada.`);
    throw e;
  }
  return { ok: true, category: { ...category, name } };
}

const IN_USE_HINT = "Pindahkan catatan itu ke kategori lain dulu.";

export async function deleteCategoryChecked(userId: string, id: string): Promise<CategoryResult> {
  const category = await getCategory(userId, id);
  if (!category) return fail(404, "Kategori tidak ditemukan.");
  if (category.isDefault) return fail(422, "Kategori bawaan tidak bisa dihapus.");
  const used = (await countTransactionsByCategory(userId)).get(category.id) ?? 0;
  if (used > 0) return fail(409, `Masih dipakai ${used} catatan. ${IN_USE_HINT}`);
  try {
    await deleteCategory(userId, category.id);
  } catch {
    // Database menolak (trigger 0008) bila ada catatan baru yang memakainya sesaat sebelumnya.
    return fail(409, `Kategori ini masih dipakai. ${IN_USE_HINT}`);
  }
  return { ok: true, category };
}
