// Ringkasan pengeluaran untuk dashboard: per kategori dan per hari. Fungsi murni — dipakai
// dashboard aplikasi (dihitung dari data di perangkat) dan sheet "Dashboard" laporan Excel.
import { shiftISODate } from "@/lib/format";

export type ExpenseItem = {
  type: "income" | "expense";
  amount: number;
  date: string; // YYYY-MM-DD
  /** Kunci pengelompokan kategori (id di aplikasi, nama di Excel). */
  categoryKey: string;
  categoryName: string;
};

export type CategoryExpense = {
  key: string;
  name: string;
  total: number;
  count: number;
  /** Porsi dari total pengeluaran, 0–1. */
  share: number;
};

export type DailyExpense = { date: string; total: number; count: number };

export const OTHER_CATEGORY_KEY = "__lainnya";

/** Pengeluaran per kategori, terbesar dulu (kategori tanpa pengeluaran tidak ikut). */
export function expenseByCategory(items: ExpenseItem[]): CategoryExpense[] {
  const map = new Map<string, CategoryExpense>();
  let grand = 0;
  for (const it of items) {
    if (it.type !== "expense") continue;
    grand += it.amount;
    const c = map.get(it.categoryKey) ?? { key: it.categoryKey, name: it.categoryName, total: 0, count: 0, share: 0 };
    c.total += it.amount;
    c.count += 1;
    map.set(it.categoryKey, c);
  }
  return [...map.values()]
    .map((c) => ({ ...c, share: grand > 0 ? c.total / grand : 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "id"));
}

/** Ringkas jadi `max` kategori teratas + "Lainnya" (supaya grafik tetap terbaca). */
export function foldCategories(list: CategoryExpense[], max: number): CategoryExpense[] {
  if (list.length <= max) return list;
  const rest = list.slice(max - 1);
  return [
    ...list.slice(0, max - 1),
    {
      key: OTHER_CATEGORY_KEY,
      name: `Lainnya (${rest.length} kategori)`,
      total: rest.reduce((n, c) => n + c.total, 0),
      count: rest.reduce((n, c) => n + c.count, 0),
      share: rest.reduce((n, c) => n + c.share, 0),
    },
  ];
}

/** Pengeluaran tiap hari dari `from` s.d. `to` (inklusif) — hari tanpa pengeluaran bernilai 0. */
export function expenseByDay(items: ExpenseItem[], from: string, to: string): DailyExpense[] {
  const days = new Map<string, DailyExpense>();
  for (let d = from; d <= to; d = shiftISODate(d, 1)) days.set(d, { date: d, total: 0, count: 0 });
  for (const it of items) {
    if (it.type !== "expense") continue;
    const day = days.get(it.date);
    if (!day) continue;
    day.total += it.amount;
    day.count += 1;
  }
  return [...days.values()];
}

export type DailyStats = {
  total: number;
  /** Hari yang ada pengeluarannya. */
  activeDays: number;
  /** Rata-rata per hari yang ada pengeluarannya (0 bila tidak ada). */
  averageActive: number;
  /** Rata-rata per hari kalender dalam rentang. */
  averageCalendar: number;
  biggest: DailyExpense | null;
};

export function dailyStats(days: DailyExpense[]): DailyStats {
  const total = days.reduce((n, d) => n + d.total, 0);
  const active = days.filter((d) => d.total > 0);
  return {
    total,
    activeDays: active.length,
    averageActive: active.length > 0 ? Math.round(total / active.length) : 0,
    averageCalendar: days.length > 0 ? Math.round(total / days.length) : 0,
    biggest: active.reduce<DailyExpense | null>((m, d) => (!m || d.total > m.total ? d : m), null),
  };
}
