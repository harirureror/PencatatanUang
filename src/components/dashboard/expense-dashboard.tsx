"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { CategoryIcon } from "@/lib/category-icons";
import {
  dailyStats,
  expenseByCategory,
  expenseByDay,
  foldCategories,
  OTHER_CATEGORY_KEY,
  type ExpenseItem,
} from "@/lib/expense-insights";
import { formatTanggalPanjang, shiftISODate } from "@/lib/format";
import { rekapHref } from "@/lib/rekap-url";
import type { Category, Project, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Money, useFormatMoney } from "@/components/money/money-provider";

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

const weekdayShort = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

type ExpenseDashboardProps = {
  project: Project;
  categories: Category[];
  transactions: Transaction[];
  today: string;
};

/** Dashboard pengeluaran proyek aktif: per kategori (seluruh proyek) dan per hari (7/14/30 hari). */
export function ExpenseDashboard({ project, categories, transactions, today }: ExpenseDashboardProps) {
  const items = useMemo<ExpenseItem[]>(() => {
    const names = new Map(categories.map((c) => [c.id, c.name]));
    return transactions.map((t) => ({
      type: t.type,
      amount: t.amount,
      date: t.transactionDate,
      categoryKey: t.categoryId,
      categoryName: names.get(t.categoryId) ?? "Tanpa kategori",
    }));
  }, [transactions, categories]);

  if (!items.some((i) => i.type === "expense")) return null;
  return (
    <>
      <CategorySection items={items} />
      <DailySection items={items} project={project} today={today} />
    </>
  );
}

function CategorySection({ items }: { items: ExpenseItem[] }) {
  const formatMoney = useFormatMoney();
  const all = expenseByCategory(items);
  const list = foldCategories(all, 6);
  const total = all.reduce((n, c) => n + c.total, 0);
  const max = Math.max(...list.map((c) => c.total));
  return (
    <section aria-labelledby="dash-kategori" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="dash-kategori" className="text-base font-semibold">
          Pengeluaran per kategori
        </h2>
        <span className="text-xs text-muted-foreground">seluruh proyek</span>
      </div>
      <div className="flex flex-col gap-4 rounded-2xl bg-background p-4 ring-1 ring-foreground/10">
        {/* Komposisi pengeluaran: satu batang, tiap kategori satu ruas (urutan sama dengan daftar). */}
        <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {list.map((c, i) => (
            <span
              key={c.key}
              className="h-full bg-primary first:rounded-l-full last:rounded-r-full"
              style={{ width: `${Math.max(c.share * 100, 1)}%`, opacity: 1 - (i / list.length) * 0.75 }}
            />
          ))}
        </div>
        <ul className="flex flex-col gap-3">
          {list.map((c) => {
            const pct = Math.round(c.share * 100);
            const label = `${c.name}: ${formatMoney(c.total)}, ${pct}% dari pengeluaran, ${c.count} catatan`;
            return (
              <li key={c.key} className="flex flex-col gap-1.5" aria-label={label}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {c.key !== OTHER_CATEGORY_KEY && (
                      <CategoryIcon categoryId={c.key} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{pct}%</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums"><Money amount={c.total} /></span>
                </div>
                <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, Math.round((c.total / max) * 100))}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
        <p className="flex justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Total pengeluaran</span>
          <span className="font-semibold tabular-nums"><Money amount={total} /></span>
        </p>
      </div>
    </section>
  );
}

function DailySection({ items, project, today }: { items: ExpenseItem[]; project: Project; today: string }) {
  const formatMoney = useFormatMoney();
  const [range, setRange] = useState<Range>(14);
  const end = project.endDate && project.endDate < today ? project.endDate : today;
  // Selalu tampilkan `range` hari penuh; hari sebelum proyek dimulai diberi tanda berbeda dan
  // tidak ikut dihitung rata-rata.
  const days = expenseByDay(items, shiftISODate(end, -(range - 1)), end);
  const beforeProject = (date: string) => date < project.startDate;
  const stats = dailyStats(days.filter((d) => !beforeProject(d.date)));
  const [picked, setPicked] = useState<string | null>(null);
  const selected = days.find((d) => d.date === picked) ?? days[days.length - 1];
  const max = Math.max(1, ...days.map((d) => d.total));
  const avgPct = (stats.averageActive / max) * 100;
  const labelEvery = range === 7 ? 1 : range === 14 ? 2 : 5;

  return (
    <section aria-labelledby="dash-harian" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="dash-harian" className="text-base font-semibold">
          Pengeluaran harian
        </h2>
        <div role="group" aria-label="Rentang grafik" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === range}
              onClick={() => {
                setRange(r);
                setPicked(null);
              }}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs font-medium transition-colors",
                r === range ? "bg-background shadow-sm ring-1 ring-foreground/10" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r} hari
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-background p-4 ring-1 ring-foreground/10">
        {/* Hari terpilih (ketuk batang untuk mengganti). */}
        <div className="flex items-end justify-between gap-2" aria-live="polite">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {formatTanggalPanjang(selected.date)}
              {selected.date === today ? " · hari ini" : ""}
            </p>
            <p className="text-xl font-semibold tabular-nums"><Money amount={selected.total} /></p>
            <p className="text-xs text-muted-foreground">
              {selected.count > 0
                ? `${selected.count} catatan pengeluaran`
                : beforeProject(selected.date)
                  ? "Sebelum proyek dimulai"
                  : "Tidak ada pengeluaran"}
            </p>
          </div>
          <Link
            href={rekapHref({ period: "harian", date: selected.date, project: project.id })}
            className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary hover:underline"
          >
            Rincian
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>

        <div className="relative h-32">
          {stats.averageActive > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-foreground/50"
              style={{ bottom: `${avgPct}%` }}
              aria-hidden
            />
          )}
          <div className={cn("flex h-full items-end", range === 30 ? "gap-0.5" : "gap-1")}>
            {days.map((d) => {
              const isSel = d.date === selected.date;
              const outside = beforeProject(d.date);
              const h = d.total > 0 ? Math.max(3, (d.total / max) * 100) : 0;
              return (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={isSel}
                  aria-label={`${formatTanggalPanjang(d.date)}: ${outside ? "sebelum proyek dimulai" : `${formatMoney(d.total)}, ${d.count} catatan`}`}
                  onClick={() => setPicked(d.date)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setPicked(d.date)}
                  className={cn(
                    "group flex h-full min-w-0 flex-1 items-end rounded-sm focus-visible:outline-2 focus-visible:outline-ring",
                    outside && "bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "block w-full rounded-t-[3px] transition-colors",
                      d.total === 0
                        ? cn("h-0.5", outside ? "border-t border-dashed border-foreground/20" : "bg-muted", isSel && "h-1 bg-foreground/30")
                        : isSel ? "bg-primary" : "bg-primary/45 group-hover:bg-primary/70",
                    )}
                    style={d.total > 0 ? { height: `${h}%` } : undefined}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="-mt-1 flex" aria-hidden>
          {days.map((d, i) => {
            const show = (days.length - 1 - i) % labelEvery === 0;
            return (
              <span
                key={d.date}
                className={cn(
                  "min-w-0 flex-1 text-center text-[10px] text-muted-foreground tabular-nums",
                  range === 30 ? "mx-px" : "mx-0.5",
                  d.date === selected.date && "font-semibold text-foreground",
                )}
              >
                {show ? (range === 7 ? weekdayShort.format(utc(d.date)) : utc(d.date).getUTCDate()) : ""}
              </span>
            );
          })}
        </div>

        {days[0].date < project.startDate && (
          <p className="-mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-2.5 rounded-sm bg-muted" aria-hidden />
            Sebelum proyek dimulai ({dayMonth.format(utc(project.startDate))})
          </p>
        )}
        <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Total {range} hari</dt>
            <dd className="font-semibold tabular-nums"><Money amount={stats.total} /></dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 border-t border-dashed border-foreground/50" aria-hidden />
              Rata-rata / hari aktif
            </dt>
            <dd className="font-semibold tabular-nums">
              <Money amount={stats.averageActive} />
              <span className="ml-1 text-xs font-normal text-muted-foreground">({stats.activeDays} hari)</span>
            </dd>
          </div>
          {stats.biggest && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Pengeluaran terbesar</dt>
              <dd>
                <button
                  type="button"
                  onClick={() => setPicked(stats.biggest!.date)}
                  className="font-semibold tabular-nums hover:underline"
                >
                  <Money amount={stats.biggest.total} />
                  <span className="ml-1 font-normal text-muted-foreground">
                    · {dayMonth.format(utc(stats.biggest.date))}
                  </span>
                </button>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
