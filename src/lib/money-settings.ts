// Pilihan format uang yang didukung (mata uang tampilan & cara penulisan angka). Daftar ini juga
// dijaga trigger database (drizzle/0017) — ubah keduanya bersamaan.

export type MoneyFormat = {
  /** Kode mata uang ISO 4217, mis. "IDR". */
  currency: string;
  /** Locale penulisan angka, mis. "id-ID" → 1.250.000 ; "en-US" → 1,250,000. */
  numberFormat: string;
};

export const CURRENCIES = [
  { code: "IDR", name: "Rupiah Indonesia" },
  { code: "USD", name: "Dolar Amerika" },
  { code: "SGD", name: "Dolar Singapura" },
  { code: "MYR", name: "Ringgit Malaysia" },
] as const;

export const NUMBER_FORMATS = [
  { locale: "id-ID", label: "Titik pemisah ribuan", example: "1.250.000" },
  { locale: "en-US", label: "Koma pemisah ribuan", example: "1,250,000" },
] as const;

export const DEFAULT_MONEY_FORMAT: MoneyFormat = { currency: "IDR", numberFormat: "id-ID" };

export const isCurrency = (v: unknown): v is string => CURRENCIES.some((c) => c.code === v);
export const isNumberFormat = (v: unknown): v is string => NUMBER_FORMATS.some((f) => f.locale === v);

export const currencyName = (code: string) => CURRENCIES.find((c) => c.code === code)?.name ?? code;
