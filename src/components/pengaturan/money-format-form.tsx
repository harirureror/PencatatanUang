"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CURRENCIES, NUMBER_FORMATS, type MoneyFormat } from "@/lib/money-settings";
import { saveMoneyFormat } from "@/lib/settings-client";
import { makeMoneyFormatter } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Contoh angka di pratinjau: sisa dana, pemasukan, pengeluaran. */
const SAMPLES = [
  { label: "Sisa uang proyek", amount: 3_750_000 },
  { label: "Uang masuk", amount: 1_500_000, sign: "+" },
  { label: "Bensin & tol", amount: 487_500, sign: "−" },
] as const;

function Option({
  name,
  value,
  checked,
  onChange,
  title,
  description,
  aside,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description?: string;
  aside?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl has-focus-visible:ring-2 has-focus-visible:ring-ring",
        checked ? "bg-primary/8" : "hover:bg-muted/60",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full ring-1",
          checked ? "bg-primary text-primary-foreground ring-primary" : "ring-foreground/25",
        )}
        aria-hidden
      >
        {checked && <Check className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
      {aside && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{aside}</span>}
    </label>
  );
}

/** Pilih mata uang & cara penulisan angka, dengan pratinjau langsung sebelum disimpan. */
export function MoneyFormatForm({
  initial,
  rates,
}: {
  initial: MoneyFormat;
  /** Kurs dari Rupiah (null = sumber kurs tidak bisa dihubungi). */
  rates: { date: string; fromIDR: Record<string, number> } | null;
}) {
  const displayFor = (f: MoneyFormat) => ({
    format: f,
    rate: f.currency === "IDR" ? 1 : (rates?.fromIDR[f.currency] ?? null),
    rateDate: rates?.date ?? null,
  });
  const router = useRouter();
  const [value, setValue] = useState(initial);
  // Nilai terakhir yang tersimpan (pembanding tombol Simpan).
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const idr = makeMoneyFormatter(displayFor({ currency: "IDR", numberFormat: value.numberFormat }));
  const changed = value.currency !== saved.currency || value.numberFormat !== saved.numberFormat;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const stored = await saveMoneyFormat(value);
      setSaved(stored);
      setMessage("Format uang disimpan.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menyimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Pratinjau */}
      <section aria-labelledby="pratinjau" className="flex flex-col gap-2">
        <h2 id="pratinjau" className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Pratinjau
        </h2>
        <div className="flex flex-col gap-3 rounded-2xl bg-primary p-4 text-primary-foreground" aria-live="polite">
          <div>
            <p className="text-xs opacity-80">{SAMPLES[0].label}</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{makeMoneyFormatter(displayFor(value))(SAMPLES[0].amount)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SAMPLES.slice(1).map((s) => (
              <div key={s.label} className="rounded-lg bg-primary-foreground/10 px-3 py-2">
                <p className="text-[11px] opacity-80">{s.label}</p>
                <p className="text-sm font-semibold tabular-nums">
                  {"sign" in s ? s.sign : ""}
                  {makeMoneyFormatter(displayFor(value))(s.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="-mt-3 px-1 text-xs text-muted-foreground">
        {value.currency === "IDR"
          ? "Semua catatan disimpan dalam Rupiah."
          : rates?.fromIDR[value.currency]
            ? `Catatan tetap disimpan dalam Rupiah dan ditampilkan setelah dikonversi memakai kurs referensi Bank Sentral Eropa tanggal ${rates.date}.`
            : "Kurs belum bisa diambil (periksa koneksi) — nominal tetap tampil dalam Rupiah sampai kurs tersedia."}
      </p>

      <section aria-labelledby="pilih-mata-uang" className="flex flex-col gap-2">
        <h2 id="pilih-mata-uang" className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Mata uang
        </h2>
        <div role="radiogroup" aria-labelledby="pilih-mata-uang" className="flex flex-col divide-y rounded-2xl bg-background ring-1 ring-foreground/10">
          {CURRENCIES.map((c) => (
            <Option
              key={c.code}
              name="currency"
              value={c.code}
              checked={value.currency === c.code}
              onChange={() => setValue((v) => ({ ...v, currency: c.code }))}
              title={c.name}
              description={c.code}
              aside={
                c.code === "IDR"
                  ? "mata uang dasar"
                  : rates?.fromIDR[c.code]
                    ? `1 ${c.code} = ${idr(1 / rates.fromIDR[c.code])}`
                    : "kurs tidak tersedia"
              }
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="pilih-angka" className="flex flex-col gap-2">
        <h2 id="pilih-angka" className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Penulisan angka
        </h2>
        <div role="radiogroup" aria-labelledby="pilih-angka" className="flex flex-col divide-y rounded-2xl bg-background ring-1 ring-foreground/10">
          {NUMBER_FORMATS.map((f) => (
            <Option
              key={f.locale}
              name="numberFormat"
              value={f.locale}
              checked={value.numberFormat === f.locale}
              onChange={() => setValue((v) => ({ ...v, numberFormat: f.locale }))}
              title={f.label}
              aside={f.example}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <Button className="h-12 text-base" disabled={!changed || saving} aria-busy={saving} onClick={() => void save()}>
          {saving && <LoaderCircle className="animate-spin" aria-hidden />}
          {saving ? "Menyimpan…" : "Simpan format"}
        </Button>
        <p role="status" aria-live="polite" className="min-h-4 text-center text-xs text-muted-foreground">
          {changed ? "" : (message ?? "Belum ada perubahan.")}
        </p>
      </div>
    </div>
  );
}
