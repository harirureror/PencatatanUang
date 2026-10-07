// Pengaturan pengguna (satu baris `settings` per akun): format uang & batas saldo menipis.
// Baris ikut tersinkron ke perangkat (rev / updated_at dijaga trigger).
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_LOW_BALANCE_THRESHOLD, MAX_LOW_BALANCE_THRESHOLD } from "@/server/projects";
import { DEFAULT_MONEY_FORMAT, isCurrency, isNumberFormat, type MoneyFormat } from "@/lib/money-settings";


export type UserSettings = MoneyFormat & { lowBalanceThreshold: number };

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [row] = await db
    .select({
      currency: settings.currency,
      numberFormat: settings.numberFormat,
      lowBalanceThreshold: settings.lowBalanceThreshold,
    })
    .from(settings)
    .where(eq(settings.userId, userId))
    .limit(1);
  return {
    // Nilai lama yang tidak dikenal kembali ke bawaan (trigger 0017 mencegah nilai baru seperti itu).
    currency: row && isCurrency(row.currency) ? row.currency : DEFAULT_MONEY_FORMAT.currency,
    numberFormat: row && isNumberFormat(row.numberFormat) ? row.numberFormat : DEFAULT_MONEY_FORMAT.numberFormat,
    lowBalanceThreshold: row?.lowBalanceThreshold ?? DEFAULT_LOW_BALANCE_THRESHOLD,
  };
}

export type SettingsPatch = Partial<UserSettings>;
export type SettingsFieldErrors = Partial<Record<keyof UserSettings, string>>;

/** Validasi isian PATCH: hanya kunci yang dikenal, nilai sesuai daftar yang didukung. */
export function parseSettingsPatch(body: unknown): { patch: SettingsPatch } | { fieldErrors: SettingsFieldErrors } {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const patch: SettingsPatch = {};
  const fieldErrors: SettingsFieldErrors = {};
  if ("currency" in input) {
    if (isCurrency(input.currency)) patch.currency = input.currency;
    else fieldErrors.currency = "Mata uang tidak didukung.";
  }
  if ("numberFormat" in input) {
    if (isNumberFormat(input.numberFormat)) patch.numberFormat = input.numberFormat;
    else fieldErrors.numberFormat = "Format angka tidak didukung.";
  }
  if ("lowBalanceThreshold" in input) {
    const v = input.lowBalanceThreshold;
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_LOW_BALANCE_THRESHOLD) {
      patch.lowBalanceThreshold = v;
    } else fieldErrors.lowBalanceThreshold = "Ambang saldo harus bilangan bulat Rupiah, minimal 0.";
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return { patch };
}

/** Simpan sebagian pengaturan (baris dibuat bila belum ada). */
export async function updateUserSettings(userId: string, patch: SettingsPatch): Promise<UserSettings> {
  if (Object.keys(patch).length > 0) {
    await db
      .insert(settings)
      .values({ userId, ...patch })
      .onConflictDoUpdate({ target: settings.userId, set: patch });
  }
  return getUserSettings(userId);
}

/** Pengaturan bawaan akun baru. */
export const DEFAULT_SETTINGS: UserSettings = { ...DEFAULT_MONEY_FORMAT, lowBalanceThreshold: DEFAULT_LOW_BALANCE_THRESHOLD };

/**
 * Kembalikan pengaturan ke bawaan: format uang Rupiah (titik pemisah ribuan) & batas saldo
 * menipis. Proyek aktif, kategori, proyek, dan catatan TIDAK diubah.
 */
export async function resetUserSettings(userId: string): Promise<UserSettings> {
  return updateUserSettings(userId, DEFAULT_SETTINGS);
}
