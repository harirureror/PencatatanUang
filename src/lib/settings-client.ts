// Panggilan pengaturan dari browser ke /api/settings.
import type { MoneyFormat } from "@/lib/money-settings";

/** Simpan format uang akun. Melempar Error berisi pesan untuk ditampilkan bila gagal. */
export async function saveMoneyFormat(format: MoneyFormat): Promise<MoneyFormat> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currency: format.currency, numberFormat: format.numberFormat }),
    credentials: "same-origin",
  });
  const body = (await res.json().catch(() => null)) as { data?: MoneyFormat; error?: string } | null;
  if (!res.ok || !body?.data) throw new Error(body?.error ?? "Gagal menyimpan. Coba lagi.");
  return { currency: body.data.currency, numberFormat: body.data.numberFormat };
}

/** Kembalikan pengaturan akun ke bawaan (format uang & batas saldo menipis). */
export async function resetSettings(): Promise<void> {
  const res = await fetch("/api/settings/reset", { method: "POST", credentials: "same-origin" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Gagal mengembalikan pengaturan. Coba lagi.");
  }
}
