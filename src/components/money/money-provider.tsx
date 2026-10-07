"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { DEFAULT_MONEY_DISPLAY, effectiveFormat, makeMoneyFormatter, type FormatMoney, type MoneyDisplay } from "@/lib/money";

type MoneyContextValue = MoneyDisplay & { formatMoney: FormatMoney; converted: boolean };

const MoneyContext = createContext<MoneyContextValue>({
  ...DEFAULT_MONEY_DISPLAY,
  formatMoney: makeMoneyFormatter(DEFAULT_MONEY_DISPLAY),
  converted: false,
});

/** Format uang + kurs pengguna untuk seluruh aplikasi (nilai dari server, lihat layout). */
export function MoneyFormatProvider({ display, children }: { display: MoneyDisplay; children: ReactNode }) {
  const value = useMemo(
    () => ({
      ...display,
      formatMoney: makeMoneyFormatter(display),
      converted: effectiveFormat(display).currency !== "IDR",
    }),
    [display],
  );
  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>;
}

/** Fungsi format uang sesuai pengaturan (nominal Rupiah → mata uang tampilan). */
export function useFormatMoney(): FormatMoney {
  return useContext(MoneyContext).formatMoney;
}

/** Format, kurs, dan apakah tampilan sedang dikonversi dari Rupiah. */
export function useMoneyDisplay(): MoneyContextValue {
  return useContext(MoneyContext);
}

/** Nominal (disimpan dalam Rupiah) sesuai pengaturan pengguna. Boleh dipakai di server maupun client component. */
export function Money({ amount }: { amount: number }) {
  return <>{useFormatMoney()(amount)}</>;
}

/**
 * Petunjuk di bawah kolom nominal saat tampilan memakai mata uang lain: isian tetap dalam
 * Rupiah, nilai konversinya ditampilkan, mis. "≈ $28.03 (kurs 6 Okt 2026)".
 */
export function ConvertedHint({ amount, id }: { amount: number; id?: string }) {
  const { converted, formatMoney, rateDate } = useMoneyDisplay();
  if (!converted) return null;
  return (
    <p id={id} className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
      Diisi dalam Rupiah{amount > 0 ? ` · ≈ ${formatMoney(amount)}` : ""}
      {rateDate ? ` (kurs ${rateDate})` : ""}
    </p>
  );
}
