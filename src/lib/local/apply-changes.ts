// Menerapkan perubahan dari hub (GET /api/sync/pull) ke replica proyek aktif di perangkat.
// Fungsi murni: tidak menyimpan apa pun — pemanggil (replica-store) yang menyimpan.
import { insertSorted } from "@/lib/local/outbox";
import { REPLICA_SCHEMA, type Replica } from "@/lib/local/replica";
import type { Category, Project, Transaction } from "@/lib/types";

import type { Synced, SyncChanges } from "./hub-client";

const toProject = ({ id, name, client, budget, startDate, endDate, status }: Synced<Project>): Project => ({
  id,
  name,
  client,
  budget,
  startDate,
  endDate,
  status,
});
const toCategory = ({ id, name, type, isDefault }: Synced<Category>): Category => ({ id, name, type, isDefault });
const toTransaction = (t: Synced<Transaction>): Transaction => ({
  id: t.id,
  projectId: t.projectId,
  categoryId: t.categoryId,
  type: t.type,
  amount: t.amount,
  description: t.description,
  transactionDate: t.transactionDate,
  hasReceipt: t.hasReceipt,
  noReceipt: t.noReceipt,
});

// Urutan kategori sama dengan server: bawaan dulu, buatan pengguna, "Lain-lain" paling akhir.
const isCatchAll = (c: Category) => c.isDefault && c.name === "Lain-lain";
const rank = (c: Category) => (isCatchAll(c) ? 2 : c.isDefault ? 0 : 1);
const sortCategories = (list: Category[]) =>
  list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);

const live = <T extends { deletedAt: string | null }>(row: T) => row.deletedAt === null;

/**
 * Satu versi per baris — yang rev-nya tertinggi. Pada tarikan penuh beberapa halaman, baris yang
 * berubah di tengah tarikan bisa muncul dua kali (versi lama di halaman awal, versi baru belakangan).
 */
function latest<T extends { rev: number }>(rows: T[], key: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const prev = byKey.get(key(row));
    if (!prev || row.rev > prev.rev) byKey.set(key(row), row);
  }
  return [...byKey.values()];
}

/**
 * Bangun replica dari tarikan penuh (since = 0, semua halaman digabung).
 * Null bila pengguna belum punya proyek aktif.
 */
export function buildReplica(changes: SyncChanges, cursor: number, syncedAt: string): Replica | null {
  // Satu baris settings per pengguna; ambil versi terbaru.
  const settings = latest(changes.settings, () => "settings").find(live);
  const activeId = settings?.activeProjectId;
  const project = latest(changes.projects, (p) => p.id).find(
    (p) => p.id === activeId && live(p) && p.status !== "arsip",
  );
  if (!settings || !project) return null;

  const categories = sortCategories(
    latest(changes.categories, (c) => c.id).filter(live).sort((a, b) => a.rev - b.rev).map(toCategory),
  );
  const transactions = latest(changes.transactions, (t) => t.id)
    .filter((t) => live(t) && t.projectId === project.id)
    // terbaru dulu; dalam tanggal yang sama, yang terakhir dicatat/diubah di atas
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.rev - a.rev)
    .map(toTransaction);

  return {
    schema: REPLICA_SCHEMA,
    syncedAt,
    project: toProject(project),
    lowBalanceThreshold: settings.lowBalanceThreshold,
    categories,
    transactions,
    cursor,
  };
}

/**
 * Gabungkan perubahan bertahap ke replica. "rebuild" bila proyek aktif berganti / diarsipkan
 * — data proyek baru belum ada di perangkat, jadi perlu tarikan penuh.
 */
export function mergeChanges(
  replica: Replica,
  changes: SyncChanges,
  cursor: number,
  syncedAt: string,
): Replica | "rebuild" {
  const settings = latest(changes.settings, () => "settings").find(live);
  if (settings && settings.activeProjectId !== replica.project.id) return "rebuild";

  let project = replica.project;
  const projectChange = latest(changes.projects, (p) => p.id).find((p) => p.id === replica.project.id);
  if (projectChange) {
    if (!live(projectChange) || projectChange.status === "arsip") return "rebuild";
    project = toProject(projectChange);
  }

  let categories = replica.categories;
  for (const c of [...changes.categories].sort((a, b) => a.rev - b.rev)) {
    const exists = categories.some((x) => x.id === c.id);
    if (!live(c)) categories = categories.filter((x) => x.id !== c.id);
    else if (exists) categories = categories.map((x) => (x.id === c.id ? toCategory(c) : x));
    else categories = [...categories, toCategory(c)];
  }

  let transactions = replica.transactions;
  for (const t of [...changes.transactions].sort((a, b) => a.rev - b.rev)) {
    transactions = transactions.filter((x) => x.id !== t.id);
    if (live(t) && t.projectId === project.id) transactions = insertSorted(transactions, toTransaction(t));
  }

  return {
    ...replica,
    syncedAt,
    project,
    lowBalanceThreshold: settings?.lowBalanceThreshold ?? replica.lowBalanceThreshold,
    categories: sortCategories(categories),
    transactions,
    cursor,
  };
}

/** Jumlah baris dalam satu tarikan (untuk laporan / indikator). */
export function countChanges(changes: SyncChanges): number {
  return Object.values(changes).reduce((n, list) => n + list.length, 0);
}

/** Gabungkan beberapa halaman tarikan menjadi satu. */
export function concatChanges(a: SyncChanges, b: SyncChanges): SyncChanges {
  return {
    projects: [...a.projects, ...b.projects],
    categories: [...a.categories, ...b.categories],
    transactions: [...a.transactions, ...b.transactions],
    receipts: [...a.receipts, ...b.receipts],
    settings: [...a.settings, ...b.settings],
  };
}

export const EMPTY_CHANGES: SyncChanges = {
  projects: [],
  categories: [],
  transactions: [],
  receipts: [],
  settings: [],
};
