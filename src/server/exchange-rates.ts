// Kurs mata uang untuk menampilkan nominal (disimpan dalam Rupiah) di mata uang pilihan pengguna.
// Sumber: Frankfurter (kurs referensi Bank Sentral Eropa, gratis tanpa kunci API, diperbarui tiap
// hari kerja). Disimpan di memori server; bila sumber tidak bisa dihubungi dipakai kurs terakhir.
import { CURRENCIES } from "@/lib/money-settings";

export type ExchangeRates = {
  /** Tanggal kurs (YYYY-MM-DD) dari sumbernya. */
  date: string;
  /** Kurs dari 1 Rupiah ke tiap mata uang, mis. { USD: 0.0000560 }. IDR selalu 1. */
  fromIDR: Record<string, number>;
  /** Kapan diambil (ms). */
  fetchedAt: number;
};

const SOURCE_URL = process.env.EXCHANGE_RATES_URL ?? "https://api.frankfurter.dev/v1/latest";
const FRESH_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;
const ATTEMPTS = 2;

const g = globalThis as typeof globalThis & { __kurs?: ExchangeRates; __kursLoading?: Promise<ExchangeRates | null> };

async function fetchRatesOnce(): Promise<ExchangeRates | null> {
  const symbols = ["IDR", ...CURRENCIES.map((c) => c.code).filter((c) => c !== "IDR" && c !== "USD")];
  try {
    // Basis USD lalu dihitung silang: kurs basis IDR dari sumber dibulatkan terlalu kasar.
    const res = await fetch(`${SOURCE_URL}?base=USD&symbols=${symbols.join(",")}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { date: string; rates: Record<string, number> };
    const idrPerUsd = body.rates.IDR;
    if (!(idrPerUsd > 0)) throw new Error("Kurs IDR tidak ada");
    const fromIDR: Record<string, number> = { IDR: 1, USD: 1 / idrPerUsd };
    for (const [code, perUsd] of Object.entries(body.rates)) if (code !== "IDR") fromIDR[code] = perUsd / idrPerUsd;
    return { date: body.date, fromIDR, fetchedAt: Date.now() };
  } catch (error) {
    console.warn("Kurs mata uang gagal diambil:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Sumber kurs kadang lambat menjawab — coba sekali lagi sebelum menyerah. */
async function fetchRates(): Promise<ExchangeRates | null> {
  for (let i = 0; i < ATTEMPTS; i++) {
    const rates = await fetchRatesOnce();
    if (rates) return rates;
  }
  return null;
}

/** Kurs terbaru (maks. 6 jam), kurs terakhir bila sumber gagal, atau null bila belum pernah ada. */
export async function getExchangeRates(): Promise<ExchangeRates | null> {
  const cached = g.__kurs;
  if (cached && Date.now() - cached.fetchedAt < FRESH_MS) return cached;
  g.__kursLoading ??= fetchRates().finally(() => {
    g.__kursLoading = undefined;
  });
  const fresh = await g.__kursLoading;
  if (fresh) g.__kurs = fresh;
  return fresh ?? cached ?? null;
}
