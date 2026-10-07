// Format uang sesuai pengaturan pengguna. Semua nominal DISIMPAN dalam Rupiah; bila pengguna
// memilih mata uang lain, nominal dikonversi saat ditampilkan memakai kurs (src/server/exchange-rates.ts).
// Fungsi murni — dipakai server (src/server/money.ts) dan browser (components/money/money-provider.tsx).
import { DEFAULT_MONEY_FORMAT, type MoneyFormat } from "@/lib/money-settings";

export type FormatMoney = (amountIDR: number) => string;

/** Format tampilan + kurs yang dipakai. */
export type MoneyDisplay = {
  format: MoneyFormat;
  /** Kurs 1 Rupiah → mata uang tampilan (1 untuk IDR). Null = kurs tidak tersedia. */
  rate: number | null;
  /** Tanggal kurs (YYYY-MM-DD), null untuk IDR / kurs tidak tersedia. */
  rateDate: string | null;
};

export const DEFAULT_MONEY_DISPLAY: MoneyDisplay = { format: DEFAULT_MONEY_FORMAT, rate: 1, rateDate: null };

/** Mata uang yang benar-benar dipakai menampilkan (kembali ke Rupiah bila kurs tidak ada). */
export function effectiveFormat({ format, rate }: MoneyDisplay): MoneyFormat {
  return format.currency !== "IDR" && rate === null ? { ...format, currency: "IDR" } : format;
}

const intlCache = new Map<string, Intl.NumberFormat>();
function intlFor(format: MoneyFormat): Intl.NumberFormat {
  const key = `${format.currency}|${format.numberFormat}`;
  let intl = intlCache.get(key);
  if (!intl) {
    intl = new Intl.NumberFormat(format.numberFormat, {
      style: "currency",
      currency: format.currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: format.currency === "IDR" ? 0 : 2,
    });
    intlCache.set(key, intl);
  }
  return intl;
}

/**
 * Formatter nominal Rupiah → teks mata uang tampilan, mis. 1.250.000 → "Rp1.250.000" atau
 * (USD, kurs 1/17.841) "$70.06".
 */
export function makeMoneyFormatter(display: MoneyDisplay = DEFAULT_MONEY_DISPLAY): FormatMoney {
  const format = effectiveFormat(display);
  const rate = format.currency === "IDR" ? 1 : (display.rate ?? 1);
  const intl = intlFor(format);
  return (amountIDR) => intl.format(amountIDR * rate).replace(/\s/g, "");
}

/** Simbol mata uang untuk teks, mis. "Rp", "$", "RM". */
export function currencySymbol(format: MoneyFormat = DEFAULT_MONEY_FORMAT): string {
  return (
    new Intl.NumberFormat(format.numberFormat, { style: "currency", currency: format.currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? format.currency
  );
}
