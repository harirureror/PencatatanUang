import { and, count, desc, eq, isNull, max, min, sql, sum } from "drizzle-orm";

import { db } from "@/db";
import { categories, projects, settings, transactions, type ProjectRow } from "@/db/schema";
import type { Project, ProjectSummary, TransactionType } from "@/lib/types";
import type { ProjectInput } from "@/server/project-input";

/** Ambang bawaan bila pengguna belum punya baris settings. */
export const DEFAULT_LOW_BALANCE_THRESHOLD = 1_000_000;

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    budget: row.budget,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
  };
}

/** Proyek aktif pengguna + ambang saldo; project null bila belum ada proyek aktif. */
export async function getActiveProjectWithSettings(
  userId: string,
): Promise<{ project: Project | null; lowBalanceThreshold: number }> {
  const [pref] = await db
    .select({
      activeProjectId: settings.activeProjectId,
      lowBalanceThreshold: settings.lowBalanceThreshold,
    })
    .from(settings)
    .where(eq(settings.userId, userId))
    .limit(1);
  const lowBalanceThreshold = pref?.lowBalanceThreshold ?? DEFAULT_LOW_BALANCE_THRESHOLD;
  if (!pref?.activeProjectId) return { project: null, lowBalanceThreshold };

  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, pref.activeProjectId), eq(projects.userId, userId), isNull(projects.deletedAt)))
    .limit(1);
  return { project: row ? toProject(row) : null, lowBalanceThreshold };
}

export async function getActiveProject(userId: string): Promise<Project | null> {
  return (await getActiveProjectWithSettings(userId)).project;
}

/** Proyek milik pengguna (null bila tidak ada / milik orang lain). */
export async function getProject(userId: string, projectId: string): Promise<Project | null> {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), isNull(projects.deletedAt)))
    .limit(1);
  return row ? toProject(row) : null;
}

/** Buat atau perbarui baris settings milik pengguna (satu baris per pengguna). */
async function upsertSettings(
  userId: string,
  values: Partial<Pick<typeof settings.$inferInsert, "activeProjectId" | "lowBalanceThreshold">>,
) {
  await db
    .insert(settings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: settings.userId, set: values });
}

export class ProjectNotFoundError extends Error {
  constructor() {
    super("Proyek tidak ditemukan.");
  }
}

export class ProjectArchivedError extends Error {
  constructor() {
    super("Proyek yang sudah diarsipkan tidak bisa dijadikan proyek aktif.");
  }
}

/** Ganti proyek aktif; null untuk mengosongkan. */
export async function setActiveProject(userId: string, projectId: string | null): Promise<Project | null> {
  if (projectId === null) {
    await upsertSettings(userId, { activeProjectId: null });
    return null;
  }
  const project = await getProject(userId, projectId);
  if (!project) throw new ProjectNotFoundError();
  if (project.status === "arsip") throw new ProjectArchivedError();
  try {
    await upsertSettings(userId, { activeProjectId: project.id });
  } catch (error) {
    // Trigger database menolak: proyeknya baru saja diarsipkan / dihapus (mis. di perangkat lain).
    const now = await getProject(userId, projectId);
    if (!now) throw new ProjectNotFoundError();
    if (now.status === "arsip") throw new ProjectArchivedError();
    throw error;
  }
  return project;
}

export const MAX_LOW_BALANCE_THRESHOLD = 999_999_999_999;

const STATUS_ORDER = { aktif: 0, selesai: 1, arsip: 2 } as const;

// Kepemilikan: setiap fungsi di sini menerima userId dan menyaring projects.user_id (proyek
// orang lain = tidak ditemukan → 404 di API). Agregat transaksi juga menyaring
// transactions.user_id sebagai lapis kedua, di samping trigger pemilik transaksi = pemilik
// proyek (drizzle/0005).

/** Proyek milik pengguna beserta saldonya (dihitung dari transaksi, satu query agregat). */
async function querySummaries(userId: string, projectId?: string): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      project: projects,
      totalIncome: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} end), 0)`,
      totalExpense: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} end), 0)`,
      transactionCount: count(transactions.id),
    })
    .from(projects)
    .leftJoin(
      transactions,
      and(
        eq(transactions.projectId, projects.id),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
      ),
    )
    .where(
      and(
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
        projectId ? eq(projects.id, projectId) : undefined,
      ),
    )
    .groupBy(projects.id);

  return rows.map((r) => {
    const totalIncome = Number(r.totalIncome);
    const totalExpense = Number(r.totalExpense);
    return {
      ...toProject(r.project),
      totalIncome,
      totalExpense,
      balance: r.project.budget + totalIncome - totalExpense,
      transactionCount: r.transactionCount,
    };
  });
}

/**
 * Semua proyek pengguna: proyek aktif paling atas, lalu yang berjalan, lalu terbaru
 * berdasarkan tanggal mulai.
 */
export async function listProjectSummaries(
  userId: string,
): Promise<{ projects: ProjectSummary[]; activeProjectId: string | null }> {
  const [list, { project: active }] = await Promise.all([
    querySummaries(userId),
    getActiveProjectWithSettings(userId),
  ]);
  const activeId = active?.id ?? null;
  list.sort(
    (a, b) =>
      Number(b.id === activeId) - Number(a.id === activeId) ||
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      b.startDate.localeCompare(a.startDate),
  );
  return { projects: list, activeProjectId: activeId };
}

/** Satu proyek milik pengguna beserta saldonya (null bila tidak ada / milik orang lain). */
export async function getProjectSummary(userId: string, id: string): Promise<ProjectSummary | null> {
  const [summary] = await querySummaries(userId, id);
  return summary ?? null;
}

/** Buat proyek baru (status "aktif"); bila diminta, langsung jadikan proyek aktif. */
export async function createProject(
  userId: string,
  input: ProjectInput,
  { makeActive }: { makeActive: boolean },
): Promise<Project> {
  const [row] = await db.insert(projects).values({ ...input, userId, status: "aktif" }).returning();
  if (makeActive) await upsertSettings(userId, { activeProjectId: row.id });
  return toProject(row);
}

export async function setLowBalanceThreshold(userId: string, value: number): Promise<void> {
  await upsertSettings(userId, { lowBalanceThreshold: value });
}

export type CategoryTotal = {
  categoryId: string;
  name: string;
  type: TransactionType;
  total: number;
  count: number;
};

export type ProjectDetail = {
  project: ProjectSummary;
  /** Proyek ini yang sedang dicatat. */
  isActive: boolean;
  lowBalanceThreshold: number;
  /** Saldo di bawah ambang peringatan (hanya berarti untuk proyek yang masih berjalan). */
  lowBalance: boolean;
  /** Persentase dana awal yang sudah terpakai (pengeluaran ÷ dana awal); null bila dana awal 0. */
  budgetUsedPercent: number | null;
  /** Total per kategori, terbesar dulu — pengeluaran lalu pemasukan. */
  byCategory: CategoryTotal[];
  /** Kelengkapan bukti pengeluaran: berfoto, ditandai tanpa struk, belum ada keduanya. */
  receipts: { withPhoto: number; noReceipt: number; missing: number };
  /** Rentang tanggal transaksi (null bila belum ada transaksi). */
  period: { first: string; last: string } | null;
};

/** Detail satu proyek milik pengguna beserta agregasi saldonya; null bila tidak ada. */
export async function getProjectDetail(userId: string, id: string): Promise<ProjectDetail | null> {
  const [project, { project: active, lowBalanceThreshold }] = await Promise.all([
    getProjectSummary(userId, id),
    getActiveProjectWithSettings(userId),
  ]);
  if (!project) return null;

  const [categoryRows, [stats]] = await Promise.all([
    db
      .select({
        categoryId: transactions.categoryId,
        name: categories.name,
        type: transactions.type,
        total: sum(transactions.amount).mapWith(Number),
        count: count(transactions.id),
      })
      .from(transactions)
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
      .where(
        and(
          eq(transactions.projectId, project.id),
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
        ),
      )
      .groupBy(transactions.categoryId, transactions.type)
      .orderBy(desc(sql`${transactions.type} = 'expense'`), desc(sum(transactions.amount))),
    db
      .select({
        first: min(transactions.transactionDate),
        last: max(transactions.transactionDate),
        withPhoto: sql<number>`count(case when ${transactions.type} = 'expense' and ${transactions.hasReceipt} then 1 end)`,
        noReceipt: sql<number>`count(case when ${transactions.type} = 'expense' and ${transactions.noReceipt} then 1 end)`,
        expenses: sql<number>`count(case when ${transactions.type} = 'expense' then 1 end)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.projectId, project.id),
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
        ),
      ),
  ]);

  const withPhoto = Number(stats.withPhoto);
  const noReceipt = Number(stats.noReceipt);
  return {
    project,
    isActive: active?.id === project.id,
    lowBalanceThreshold,
    lowBalance: project.status === "aktif" && project.balance < lowBalanceThreshold,
    budgetUsedPercent:
      project.budget > 0 ? Math.round((project.totalExpense / project.budget) * 100) : null,
    byCategory: categoryRows.map((r) => ({ ...r, total: r.total ?? 0 })),
    receipts: { withPhoto, noReceipt, missing: Number(stats.expenses) - withPhoto - noReceipt },
    period: stats.first && stats.last ? { first: stats.first, last: stats.last } : null,
  };
}
