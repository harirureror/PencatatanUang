// Format uang pengguna untuk kode server (server component, route handler): format pilihan dari
// `settings` akun + kurs konversi dari Rupiah. Dibaca sekali per request (React cache).
import { headers } from "next/headers";
import { cache } from "react";

import { DEFAULT_MONEY_DISPLAY, makeMoneyFormatter, type FormatMoney, type MoneyDisplay } from "@/lib/money";
import { DEFAULT_MONEY_FORMAT, type MoneyFormat } from "@/lib/money-settings";
import { USER_ID_HEADER } from "@/server/current-user";
import { getExchangeRates } from "@/server/exchange-rates";
import { getUserSettings } from "@/server/settings";

/** Format uang akun yang sedang masuk; bawaan (Rupiah) untuk halaman tamu. */
export const getMoneyFormat = cache(async (): Promise<MoneyFormat> => {
  const userId = (await headers()).get(USER_ID_HEADER);
  if (!userId) return DEFAULT_MONEY_FORMAT;
  const { currency, numberFormat } = await getUserSettings(userId);
  return { currency, numberFormat };
});

export const getMoneyDisplay = cache(async (): Promise<MoneyDisplay> => {
  const format = await getMoneyFormat();
  if (format.currency === "IDR") return { ...DEFAULT_MONEY_DISPLAY, format };
  const rates = await getExchangeRates();
  const rate = rates?.fromIDR[format.currency] ?? null;
  return { format, rate, rateDate: rate === null ? null : (rates?.date ?? null) };
});

export async function getMoneyFormatter(): Promise<FormatMoney> {
  return makeMoneyFormatter(await getMoneyDisplay());
}
