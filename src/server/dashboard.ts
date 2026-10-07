import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import type { DashboardSummary, Project } from "@/lib/types";
import { getActiveProjectWithSettings } from "@/server/projects";

export type ProjectBalance = { balance: number; totalIncome: number; totalExpense: number };

/**
 * Saldo = dana awal + total pemasukan − total pengeluaran (satu query agregat).
 * Hanya transaksi milik pengguna yang dihitung.
 */
export async function getProjectBalance(userId: string, project: Project): Promise<ProjectBalance> {
  const [totals] = await db
    .select({
      income: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} end), 0)`,
      expense: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} end), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.projectId, project.id),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    );

  const totalIncome = Number(totals.income);
  const totalExpense = Number(totals.expense);
  return { totalIncome, totalExpense, balance: project.budget + totalIncome - totalExpense };
}

/**
 * Ringkasan saldo proyek aktif milik pengguna.
 * Null bila belum ada proyek aktif (atau proyeknya sudah tidak ada).
 */
export async function getDashboardSummary(userId: string): Promise<DashboardSummary | null> {
  const { project, lowBalanceThreshold } = await getActiveProjectWithSettings(userId);
  if (!project) return null;
  return { project, ...(await getProjectBalance(userId, project)), lowBalanceThreshold };
}
