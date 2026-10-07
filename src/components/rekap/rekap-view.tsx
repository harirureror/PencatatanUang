import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarX2,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Plus,
  ReceiptText,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { CategoryIcon } from "@/lib/category-icons";
import { Money } from "@/components/money/money-provider";
import { formatTanggal, formatTanggalPanjang, shiftISODate } from "@/lib/format";
import { daysBetween, type RekapData, type RekapPeriod, type RekapTransaction } from "@/lib/rekap";
import { rekapHref } from "@/lib/rekap-url";
import { catatHref } from "@/lib/return-path";
import { cn } from "@/lib/utils";
import { getMoneyFormatter } from "@/server/money";

const TABS: { kind: RekapPeriod; label: string }[] = [
  { kind: "harian", label: "Harian" },
  { kind: "mingguan", label: "Mingguan" },
  { kind: "rentang", label: "Rentang" },
];

/** Tab Harian / Mingguan / Rentang — tanggal & proyek yang sedang dilihat dipertahankan. */
export function PeriodTabs({ period, date, project }: { period: RekapPeriod; date: string; project: string }) {
  return (
    <nav aria-label="Periode rekap" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
      {TABS.map((tab) => {
        const active = tab.kind === period;
        return (
          <Link
            key={tab.kind}
            href={rekapHref({ period: tab.kind, date, project })}
            replace
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-colors",
              active
                ? "bg-background shadow-sm ring-1 ring-foreground/10"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

const dayMonth = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const short = (iso: string) => dayMonth.format(new Date(`${iso}T00:00:00`));

export function periodLabel({ kind, start, end }: RekapData["period"]) {
  if (kind === "harian") return formatTanggalPanjang(start);
  if (start === end) return formatTanggal(start);
  return `${short(start)} – ${formatTanggal(end)}`;
}

/** Pindah ke hari/minggu sebelum & sesudahnya; tidak bisa melewati hari ini. */
export function PeriodNav({ data, date, today }: { data: RekapData; date: string; today: string }) {
  if (data.period.kind === "rentang") {
    return (
      <p className="text-center text-sm font-semibold" aria-live="polite">
        {periodLabel(data.period)}
        <span className="block text-xs font-normal text-muted-foreground">
          {daysBetween(data.period.start, data.period.end)} hari
        </span>
      </p>
    );
  }
  const project = data.project.id;
  const step = data.period.kind === "harian" ? 1 : 7;
  const prev = shiftISODate(date, -step);
  const next = shiftISODate(date, step);
  const nextStart = data.period.kind === "harian" ? next : shiftISODate(data.period.end, 1);
  const canNext = nextStart <= today;
  const isCurrent = data.period.start <= today && today <= data.period.end;
  const navButton = "flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ring-foreground/10 print:hidden";

  return (
    <div className="flex items-center gap-2">
      <Link href={rekapHref({ period: data.period.kind, date: prev, project })} replace aria-label="Periode sebelumnya" className={cn(navButton, "hover:bg-muted")}>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-sm font-semibold" aria-live="polite">
          {periodLabel(data.period)}
        </p>
        {isCurrent ? (
          <p className="text-xs text-muted-foreground">{data.period.kind === "harian" ? "Hari ini" : "Minggu ini"}</p>
        ) : (
          <Link href={rekapHref({ period: data.period.kind, date: today, project })} replace className="text-xs font-medium text-primary hover:underline">
            Kembali ke {data.period.kind === "harian" ? "hari ini" : "minggu ini"}
          </Link>
        )}
      </div>
      {canNext ? (
        <Link href={rekapHref({ period: data.period.kind, date: next, project })} replace aria-label="Periode berikutnya" className={cn(navButton, "hover:bg-muted")}>
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={cn(navButton, "opacity-30")}>
          <ChevronRight className="size-5" />
        </span>
      )}
    </div>
  );
}

/** Angka utama periode: masuk, keluar, selisih, sisa dana, dan kelengkapan bukti. */
export function RekapSummary({ data }: { data: RekapData }) {
  const figures = [
    { label: "Uang masuk", value: data.totalIncome, icon: ArrowDownLeft, tone: "text-emerald-700 dark:text-emerald-400", sign: "+" },
    { label: "Uang keluar", value: data.totalExpense, icon: ArrowUpRight, tone: "text-rose-700 dark:text-rose-400", sign: "−" },
  ];
  const expenses = data.receipts.withPhoto + data.receipts.noReceipt + data.receipts.missing;
  return (
    <section aria-label="Ringkasan periode" className="flex flex-col gap-3 rounded-2xl bg-background p-4 ring-1 ring-foreground/10">
      <div className="grid grid-cols-2 gap-3">
        {figures.map((f) => (
          <div key={f.label} className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <f.icon className={cn("size-3.5", f.tone)} aria-hidden />
              {f.label}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {f.value > 0 ? f.sign : ""}
              <Money amount={f.value} />
            </span>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-3 text-sm">
        <dt className="flex items-center gap-1 text-muted-foreground">
          <Scale className="size-3.5" aria-hidden />
          Selisih periode
        </dt>
        <dd className={cn("text-right font-medium tabular-nums", data.net < 0 && "text-rose-700 dark:text-rose-400")}>
          {data.net > 0 ? "+" : data.net < 0 ? "−" : ""}
          <Money amount={Math.abs(data.net)} />
        </dd>
        <dt className="flex items-center gap-1 text-muted-foreground">
          <Wallet className="size-3.5" aria-hidden />
          Sisa dana akhir periode
        </dt>
        <dd className={cn("text-right font-medium tabular-nums", data.balanceAtEnd < 0 && "text-rose-700 dark:text-rose-400")}>
          {data.balanceAtEnd < 0 ? "−" : ""}
          <Money amount={Math.abs(data.balanceAtEnd)} />
        </dd>
        <dt className="flex items-center gap-1 text-muted-foreground">
          <ReceiptText className="size-3.5" aria-hidden />
          Catatan
        </dt>
        <dd className="text-right font-medium tabular-nums">{data.count}</dd>
        {expenses > 0 && (
          <>
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Camera className="size-3.5" aria-hidden />
              Bukti pengeluaran
            </dt>
            <dd className="text-right font-medium tabular-nums">
              {data.receipts.withPhoto}/{expenses} berfoto
              {data.receipts.missing > 0 && (
                <span className="block text-xs font-normal text-amber-700 dark:text-amber-400">
                  {data.receipts.missing} belum ada bukti
                </span>
              )}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

/** Batang horizontal satu seri: panjang = nilai ÷ nilai terbesar. Angka ditulis langsung. */
function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-muted" title={label}>
      <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Pengeluaran per kategori (batang) + pemasukan per sumber. */
export async function CategoryBreakdown({ data }: { data: RekapData }) {
  const formatMoney = await getMoneyFormatter();
  const expenses = data.byCategory.filter((c) => c.type === "expense");
  const incomes = data.byCategory.filter((c) => c.type === "income");
  const max = Math.max(0, ...expenses.map((c) => c.total));
  if (data.byCategory.length === 0) return null;
  return (
    <section aria-labelledby="per-kategori" className="flex flex-col gap-3">
      <h2 id="per-kategori" className="px-1 text-sm font-semibold">
        Per kategori
      </h2>
      <ul className="flex flex-col gap-3 rounded-2xl bg-background p-4 ring-1 ring-foreground/10">
        {expenses.map((c) => {
          const share = data.totalExpense > 0 ? Math.round((c.total / data.totalExpense) * 100) : 0;
          const label = `${c.name}: ${formatMoney(c.total)} · ${c.count} catatan · ${share}% pengeluaran`;
          return (
            <li key={c.categoryId} className="flex flex-col gap-1.5" aria-label={label}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <CategoryIcon categoryId={c.categoryId} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{share}%</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums"><Money amount={c.total} /></span>
              </div>
              <Bar value={c.total} max={max} label={label} />
            </li>
          );
        })}
        {incomes.map((c) => (
          <li key={c.categoryId} className="flex items-baseline justify-between gap-2 border-t pt-3 text-sm first:border-t-0 first:pt-0">
            <span className="flex min-w-0 items-center gap-2">
              <CategoryIcon categoryId={c.categoryId} className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
              <span className="truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground">pemasukan</span>
            </span>
            <span className="shrink-0 font-medium text-emerald-700 tabular-nums dark:text-emerald-400">+<Money amount={c.total} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "short" });

/** Perubahan dibanding periode sebelumnya: ikon + "naik/turun N%" (warna netral). */
function Change({ now, before }: { now: number; before: number }) {
  if (before === 0) return <span>{now > 0 ? "sebelumnya kosong" : "sama"}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span>sama</span>;
  const up = pct > 0;
  return (
    <span className="inline-flex items-center gap-1">
      {up ? <TrendingUp className="size-4" aria-hidden /> : <TrendingDown className="size-4" aria-hidden />}
      {up ? "naik" : "turun"} {Math.abs(pct)}%
    </span>
  );
}

/** Rekap mingguan / rentang: rata-rata per hari, hari terbesar, perbandingan dengan periode sebelumnya. */
export function WeekInsights({ data }: { data: RekapData }) {
  const before = data.period.kind === "mingguan" ? "minggu lalu" : `${daysBetween(data.period.start, data.period.end)} hari sebelumnya`;
  const active = data.byDay.filter((d) => d.expense > 0);
  if (data.count === 0 && data.previous.totalExpense === 0) return null;
  const biggest = active.reduce<RekapData["byDay"][number] | null>((m, d) => (!m || d.expense > m.expense ? d : m), null);
  const average = active.length > 0 ? Math.round(data.totalExpense / active.length) : 0;
  return (
    <ul className="grid gap-2 rounded-2xl bg-background p-4 text-sm ring-1 ring-foreground/10">
      {active.length > 0 && (
        <li className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Rata-rata per hari ({active.length} hari)</span>
          <span className="font-medium tabular-nums"><Money amount={average} /></span>
        </li>
      )}
      {biggest && (
        <li className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Hari terbesar</span>
          <span className="font-medium">
            {formatTanggalPanjang(biggest.date).split(",")[0]} · <span className="tabular-nums"><Money amount={biggest.expense} /></span>
          </span>
        </li>
      )}
      <li className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">
          Dibanding {before}
          {data.previous.totalExpense > 0 && (
            <span className="block text-xs tabular-nums"><Money amount={data.previous.totalExpense} /></span>
          )}
        </span>
        <span className="font-medium">
          <Change now={data.totalExpense} before={data.previous.totalExpense} />
        </span>
      </li>
    </ul>
  );
}

/**
 * Rekap mingguan: pengeluaran tiap hari Senin–Minggu. Ketuk hari untuk membuka rinciannya di
 * tempat (catatan hari itu), atau lanjut ke rekap hariannya.
 */
export async function DayBreakdown({ data, today }: { data: RekapData; today: string }) {
  const formatMoney = await getMoneyFormatter();
  const max = Math.max(0, ...data.byDay.map((d) => d.expense));
  return (
    <section aria-labelledby="per-hari" className="flex flex-col gap-3">
      <h2 id="per-hari" className="px-1 text-sm font-semibold">
        Rincian per hari
      </h2>
      <ul className="divide-y overflow-hidden rounded-2xl bg-background ring-1 ring-foreground/10">
        {(data.period.kind === "rentang" ? data.byDay.filter((d) => d.count > 0).reverse() : data.byDay).map((d) => {
          const future = d.date > today;
          const dayName = weekday.format(new Date(`${d.date}T00:00:00`));
          const label = `${formatTanggalPanjang(d.date)}: keluar ${formatMoney(d.expense)}${d.income ? `, masuk ${formatMoney(d.income)}` : ""} · ${d.count} catatan`;
          const dayCell = (
            <span className="w-16 shrink-0 text-sm">
              <span className={cn("font-medium", d.date === today && "text-primary")}>{dayName}</span>
              <span className="block text-xs text-muted-foreground">{short(d.date)}</span>
            </span>
          );
          if (d.count === 0) {
            return (
              <li key={d.date} className="flex items-center gap-3 px-4 py-3">
                {dayCell}
                <span className="text-sm text-muted-foreground">{future ? "Belum terjadi" : "Tidak ada catatan"}</span>
              </li>
            );
          }
          const items = data.transactions.filter((t) => t.transactionDate === d.date);
          return (
            <li key={d.date}>
              <details className="group">
                <summary
                  aria-label={label}
                  className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-muted/50 [&::-webkit-details-marker]:hidden"
                >
                  {dayCell}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex justify-between gap-2 text-sm">
                      <span className="font-medium tabular-nums">{d.expense > 0 ? <Money amount={d.expense} /> : "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {d.income > 0 && <span className="text-emerald-700 dark:text-emerald-400">+<Money amount={d.income} /> · </span>}
                        {d.count} catatan
                      </span>
                    </span>
                    <Bar value={d.expense} max={max} label={label} />
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="border-t bg-muted/30">
                  <ul className="divide-y">
                    {items.map((t) => (
                      <TransactionRow key={t.id} t={t} />
                    ))}
                  </ul>
                  <Link
                    href={rekapHref({ period: "harian", date: d.date, project: data.project.id })}
                    className="flex items-center justify-center gap-0.5 border-t py-2.5 text-xs font-medium text-primary hover:bg-muted/50 print:hidden"
                  >
                    Rekap harian {dayName} {short(d.date)}
                    <ChevronRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Satu baris catatan (rekap harian & rincian hari di rekap mingguan). */
function TransactionRow({ t }: { t: RekapTransaction }) {
  const income = t.type === "income";
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          income ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
        )}
      >
        <CategoryIcon categoryId={t.categoryId} className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{t.description || t.categoryName}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t.categoryName}
          {!income &&
            (t.hasReceipt ? (
              <span className="flex items-center gap-0.5">
                · <Camera className="size-3" aria-hidden /> berfoto
              </span>
            ) : t.noReceipt ? (
              <span className="text-amber-700 dark:text-amber-400">· tanpa struk</span>
            ) : (
              <span className="flex items-center gap-0.5 text-amber-700 dark:text-amber-400">
                · <CircleHelp className="size-3" aria-hidden /> belum ada bukti
              </span>
            ))}
        </span>
      </span>
      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", income ? "text-emerald-700 dark:text-emerald-400" : "")}>
        {income ? "+" : "−"}
        <Money amount={t.amount} />
      </span>
    </li>
  );
}

/** Rekap harian: semua catatan hari itu. */
export function DayTransactions({ data, today }: { data: RekapData; today: string }) {
  return (
    <section aria-labelledby="catatan-hari" className="flex flex-col gap-3">
      <h2 id="catatan-hari" className="px-1 text-sm font-semibold">
        Catatan {data.period.start === today ? "hari ini" : formatTanggal(data.period.start)}
      </h2>
      <ul className="divide-y overflow-hidden rounded-2xl bg-background ring-1 ring-foreground/10">
        {data.transactions.map((t) => (
          <TransactionRow key={t.id} t={t} />
        ))}
      </ul>
    </section>
  );
}

/** "hari ini" / "pada 28 Sep 2026" / "minggu ini" / "pada minggu tersebut" / "dalam rentang ini". */
function periodPhrase({ kind, start, end }: RekapData["period"], today: string): string {
  if (kind === "harian") return start === today ? "hari ini" : `pada ${formatTanggal(start)}`;
  if (kind === "mingguan") return start <= today && today <= end ? "minggu ini" : "pada minggu tersebut";
  return "dalam rentang ini";
}

/**
 * Rekap kosong. Dua keadaan: proyek belum punya catatan sama sekali (ajak mencatat), atau
 * periode ini saja yang kosong (tunjukkan catatan terdekat sebelum / sesudahnya).
 */
export function RekapEmpty({
  data,
  today,
  isActiveProject,
}: {
  data: RekapData;
  today: string;
  /** Proyek yang direkap adalah proyek aktif (catatan baru masuk ke sini). */
  isActiveProject: boolean;
}) {
  const project = data.project.id;
  const kind = data.period.kind;
  const jump = (date: string) =>
    kind === "rentang"
      ? rekapHref({ period: "harian", date, project })
      : rekapHref({ period: kind, date, project });

  if (data.projectCount === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-background px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ReceiptText className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Belum ada catatan di proyek ini</p>
          <p className="text-sm text-muted-foreground">
            {isActiveProject
              ? "Rekap akan terisi otomatis begitu pengeluaran atau pemasukan pertama dicatat."
              : "Catatan proyek ini masuk saat proyek dijadikan proyek aktif."}
          </p>
        </div>
        {isActiveProject ? (
          <Link href={catatHref("expense")} className={cn(buttonVariants(), "h-11")}>
            <Plus aria-hidden />
            Catat pengeluaran
          </Link>
        ) : (
          <Link href="/proyek" className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
            Kelola proyek
          </Link>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-background px-6 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarX2 className="size-6" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">Tidak ada catatan {periodPhrase(data.period, today)}</p>
        <p className="text-sm text-muted-foreground">
          Sisa dana proyek saat itu{" "}
          <span className="font-medium text-foreground tabular-nums">
            {data.balanceAtEnd < 0 ? "−" : ""}
            <Money amount={Math.abs(data.balanceAtEnd)} />
          </span>
          .
        </p>
      </div>
      {(data.nearby.before || data.nearby.after) && (
        <div className="flex w-full flex-col gap-2">
          {data.nearby.before && (
            <Link href={jump(data.nearby.before)} replace className={cn(buttonVariants({ variant: "outline" }), "h-11 justify-between")}>
              <span className="flex items-center gap-2">
                <ChevronLeft aria-hidden />
                Catatan terakhir sebelumnya
              </span>
              <span className="text-xs text-muted-foreground">{formatTanggal(data.nearby.before)}</span>
            </Link>
          )}
          {data.nearby.after && (
            <Link href={jump(data.nearby.after)} replace className={cn(buttonVariants({ variant: "outline" }), "h-11 justify-between")}>
              <span className="text-xs text-muted-foreground">{formatTanggal(data.nearby.after)}</span>
              <span className="flex items-center gap-2">
                Catatan berikutnya
                <ChevronRight aria-hidden />
              </span>
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
