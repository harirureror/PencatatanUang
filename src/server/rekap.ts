// Layanan agregasi Rekap Laporan: total pemasukan, pengeluaran, dan saldo proyek per periode.
// Semua dihitung di database dalam satu query agregat (bersyarat per rentang tanggal), hanya dari
// transaksi milik pengguna yang belum dihapus.
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { shiftISODate } from "@/lib/format";
import {
  daysBetween,
  periodRange,
  weekRange,
  type RekapData,
  type RekapProject,
  type RekapQuery,
  type RekapTransaction,
} from "@/lib/rekap";
import type { Project } from "@/lib/types";
import { getProject, listProjectSummaries } from "@/server/projects";

export type PeriodRange = { start: string; end: string };

export type RekapTotals = {
  period: PeriodRange;
  /** Tanggal mulai proyek ada di periode ini — dana awal ikut dihitung sebagai uang masuk. */
  budgetInPeriod: boolean;
  /** Uang masuk dalam periode, termasuk dana awal bila tanggal mulai proyek ada di periode. */
  totalIncome: number;
  totalExpense: number;
  /** Pemasukan − pengeluaran dalam periode. */
  net: number;
  /** Jumlah catatan dalam periode. */
  count: number;
  /** Sisa dana proyek sebelum periode dimulai (masuk termasuk dana awal − keluar sebelum `start`). */
  balanceAtStart: number;
  /** Sisa dana proyek di akhir periode (dana awal + masuk − keluar s.d. `end`). */
  balanceAtEnd: number;
  /** Periode sebelumnya sepanjang periode ini (kemarin / minggu lalu / rentang sebelumnya). */
  previous: PeriodRange & { totalIncome: number; totalExpense: number };
  /** Jumlah seluruh catatan proyek — 0 = proyek belum punya catatan. */
  projectCount: number;
  /** Tanggal catatan terdekat sebelum / sesudah periode. */
  nearby: { before: string | null; after: string | null };
};

/** Periode sebelumnya dengan panjang yang sama, berakhir sehari sebelum `start`. */
export function previousRange({ start, end }: PeriodRange): PeriodRange {
  const length = daysBetween(start, end);
  return { start: shiftISODate(start, -length), end: shiftISODate(start, -1) };
}

/** Agregat satu periode untuk proyek yang sudah dipastikan milik pengguna. */
export async function aggregateRekapTotals(
  userId: string,
  project: Pick<Project, "id" | "budget" | "startDate">,
  period: PeriodRange,
): Promise<RekapTotals> {
  const { start, end } = period;
  const prev = previousRange(period);
  const t = transactions;
  const date = t.transactionDate;
  const sumIf = (type: "income" | "expense", cond: ReturnType<typeof sql>) =>
    sql<number>`coalesce(sum(case when ${t.type} = ${type} and ${cond} then ${t.amount} end), 0)`;
  const inPeriod = sql`${date} >= ${start} and ${date} <= ${end}`;
  const beforeStart = sql`${date} < ${start}`;
  const inPrevious = sql`${date} >= ${prev.start} and ${date} <= ${prev.end}`;

  const [row] = await db
    .select({
      income: sumIf("income", inPeriod),
      expense: sumIf("expense", inPeriod),
      count: sql<number>`coalesce(sum(case when ${inPeriod} then 1 end), 0)`,
      incomeBefore: sumIf("income", beforeStart),
      expenseBefore: sumIf("expense", beforeStart),
      prevIncome: sumIf("income", inPrevious),
      prevExpense: sumIf("expense", inPrevious),
      projectCount: sql<number>`count(*)`,
      before: sql<string | null>`max(case when ${beforeStart} then ${date} end)`,
      after: sql<string | null>`min(case when ${date} > ${end} then ${date} end)`,
    })
    .from(t)
    .where(and(eq(t.userId, userId), eq(t.projectId, project.id), isNull(t.deletedAt)));

  // Dana awal dihitung sebagai uang masuk pada tanggal mulai proyek.
  const budgetIn = (r: PeriodRange) => (r.start <= project.startDate && project.startDate <= r.end ? project.budget : 0);
  const budgetBefore = project.startDate < start ? project.budget : 0;
  const totalIncome = Number(row.income) + budgetIn(period);
  const totalExpense = Number(row.expense);
  const balanceAtStart = budgetBefore + Number(row.incomeBefore) - Number(row.expenseBefore);
  return {
    period: { start, end },
    budgetInPeriod: start <= project.startDate && project.startDate <= end,
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    count: Number(row.count),
    balanceAtStart,
    balanceAtEnd: balanceAtStart + totalIncome - totalExpense,
    previous: { ...prev, totalIncome: Number(row.prevIncome) + budgetIn(prev), totalExpense: Number(row.prevExpense) },
    projectCount: Number(row.projectCount),
    nearby: { before: row.before ?? null, after: row.after ?? null },
  };
}

/**
 * Total pemasukan, pengeluaran, dan saldo satu proyek untuk periode `start`–`end` (inklusif).
 * Null bila proyek tidak ada / milik pengguna lain.
 */
export async function getRekapTotals(
  userId: string,
  projectId: string,
  period: PeriodRange,
): Promise<(RekapTotals & { project: Project }) | null> {
  if (period.start > period.end) throw new RangeError("Tanggal awal harus sebelum tanggal akhir.");
  const project = await getProject(userId, projectId);
  if (!project) return null;
  return { project, ...(await aggregateRekapTotals(userId, project, period)) };
}

// ---- Rekap lengkap satu periode (kontrak RekapData halaman Rekap) ---------------------------

export const BUDGET_ENTRY_ID = "dana-awal";

/** Dana awal proyek sebagai baris pemasukan (bukan transaksi tersimpan — tidak bisa diubah). */
function budgetEntry(project: Pick<Project, "budget" | "startDate">): RekapTransaction {
  return {
    id: BUDGET_ENTRY_ID,
    transactionDate: project.startDate,
    type: "income",
    categoryId: BUDGET_ENTRY_ID,
    categoryName: "Dana awal proyek",
    amount: project.budget,
    description: "Dana awal proyek",
    hasReceipt: false,
    noReceipt: false,
  };
}

/** Catatan proyek dalam rentang beserta nama kategorinya, terbaru dulu. */
async function periodTransactions(userId: string, projectId: string, { start, end }: PeriodRange) {
  const rows = await db
    .select({ tx: transactions, categoryName: categories.name })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.projectId, projectId),
        isNull(transactions.deletedAt),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end),
      ),
    )
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt));
  return rows.map(
    ({ tx, categoryName }): RekapTransaction => ({
      id: tx.id,
      transactionDate: tx.transactionDate,
      type: tx.type,
      categoryId: tx.categoryId,
      categoryName,
      amount: tx.amount,
      description: tx.description,
      hasReceipt: tx.hasReceipt,
      noReceipt: tx.noReceipt,
    }),
  );
}

/** Jumlah catatan per hari dalam rentang (untuk penanda pemilih tanggal). */
async function countsPerDay(userId: string, projectId: string, { start, end }: PeriodRange) {
  const rows = await db
    .select({ date: transactions.transactionDate, count: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.projectId, projectId),
        isNull(transactions.deletedAt),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end),
      ),
    )
    .groupBy(transactions.transactionDate);
  const map = new Map(rows.map((r) => [r.date, Number(r.count)]));
  const days: { date: string; count: number }[] = [];
  for (let d = start; d <= end; d = shiftISODate(d, 1)) days.push({ date: d, count: map.get(d) ?? 0 });
  return days;
}

/**
 * Rekap satu periode (harian / mingguan / rentang) untuk proyek milik pengguna: total, saldo,
 * kelengkapan bukti, per kategori, per hari, daftar catatan, dan pembanding periode sebelumnya.
 * Null bila proyek tidak ada / milik pengguna lain.
 */
export async function getRekap(userId: string, query: RekapQuery): Promise<RekapData | null> {
  const project = await getProject(userId, query.projectId);
  if (!project) return null;
  const range = periodRange(query);
  if (range.start > range.end) throw new RangeError("Tanggal awal harus sebelum tanggal akhir.");
  const week = weekRange(query.period === "harian" ? query.date : range.start);

  const [totals, list, weekCounts] = await Promise.all([
    aggregateRekapTotals(userId, project, range),
    periodTransactions(userId, project.id, range),
    countsPerDay(userId, project.id, week),
  ]);

  const categoryTotals = new Map<string, RekapData["byCategory"][number]>();
  const dayTotals = new Map<string, RekapData["byDay"][number]>();
  for (let d = range.start; d <= range.end; d = shiftISODate(d, 1)) {
    dayTotals.set(d, { date: d, income: 0, expense: 0, count: 0 });
  }
  // Dana awal sebagai baris pemasukan di tanggal mulai (paling awal di hari itu → paling akhir
  // di daftar terbaru-dulu).
  if (totals.budgetInPeriod && project.budget > 0) {
    const at = list.findIndex((t) => t.transactionDate < project.startDate);
    list.splice(at === -1 ? list.length : at, 0, budgetEntry(project));
  }
  for (const t of list) {
    const c = categoryTotals.get(t.categoryId) ?? { categoryId: t.categoryId, name: t.categoryName, type: t.type, total: 0, count: 0 };
    c.total += t.amount;
    c.count += 1;
    categoryTotals.set(t.categoryId, c);
    const day = dayTotals.get(t.transactionDate)!;
    day[t.type] += t.amount;
    day.count += 1;
  }
  const expenses = list.filter((t) => t.type === "expense");
  const withPhoto = expenses.filter((t) => t.hasReceipt).length;
  const noReceipt = expenses.filter((t) => !t.hasReceipt && t.noReceipt).length;

  return {
    project,
    period: { kind: query.period, ...range },
    totalIncome: totals.totalIncome,
    totalExpense: totals.totalExpense,
    net: totals.net,
    balanceAtEnd: totals.balanceAtEnd,
    count: totals.count,
    receipts: { withPhoto, noReceipt, missing: expenses.length - withPhoto - noReceipt },
    byCategory: [...categoryTotals.values()].sort(
      (a, b) => Number(b.type === "expense") - Number(a.type === "expense") || b.total - a.total,
    ),
    byDay: [...dayTotals.values()],
    transactions: list,
    week: weekCounts,
    previous: totals.previous,
    projectCount: totals.projectCount,
    nearby: totals.nearby,
  };
}

// ---- Daftar proyek untuk filter Rekap -----------------------------------------------------

export type RekapProjectOption = RekapProject & {
  transactionCount: number;
  /** Tanggal catatan pertama / terakhir (null bila belum ada catatan). */
  firstDate: string | null;
  lastDate: string | null;
};

/**
 * Semua proyek pengguna yang bisa direkap: proyek aktif dulu, lalu yang berjalan, selesai,
 * arsip (terbaru dulu), beserta jumlah & rentang tanggal catatannya.
 */
export async function getRekapProjects(
  userId: string,
): Promise<{ projects: RekapProjectOption[]; activeProjectId: string | null }> {
  const [{ projects, activeProjectId }, spans] = await Promise.all([
    listProjectSummaries(userId),
    db
      .select({
        projectId: transactions.projectId,
        first: sql<string>`min(${transactions.transactionDate})`,
        last: sql<string>`max(${transactions.transactionDate})`,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
      .groupBy(transactions.projectId),
  ]);
  const span = new Map(spans.map((s) => [s.projectId, s]));
  return {
    activeProjectId,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      client: p.client,
      budget: p.budget,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      transactionCount: p.transactionCount,
      firstDate: span.get(p.id)?.first ?? null,
      lastDate: span.get(p.id)?.last ?? null,
    })),
  };
}
