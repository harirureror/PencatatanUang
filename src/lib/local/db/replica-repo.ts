// Simpan / muat replica proyek aktif ke tabel-tabel DB lokal (bukan satu blob JSON), supaya
// data perangkat bisa di-query langsung dan siap disinkronkan per baris.
import { REPLICA_SCHEMA, type Replica } from "@/lib/local/replica";
import type { Category, Project, Transaction } from "@/lib/types";

import type { LocalDb, Row, Statement } from "./client";

const META_SYNCED_AT = "replica_synced_at";
/** Tabel yang isinya ditarik dari server bersama replica. */
const PULLED_TABLES = ["projects", "categories", "transactions", "settings"] as const;
const META_SCHEMA = "replica_schema";
const META_CURSOR = "replica_cursor";
const SETTINGS_ID = "local";

const str = (v: Row[string]) => (v === null ? null : String(v));
const num = (v: Row[string]) => Number(v ?? 0);

export async function loadReplica(db: LocalDb): Promise<Replica | null> {
  const meta = new Map(
    (await db.query("SELECT key, value FROM meta")).map((r) => [String(r.key), String(r.value)]),
  );
  const syncedAt = meta.get(META_SYNCED_AT);
  if (!syncedAt || Number(meta.get(META_SCHEMA)) !== REPLICA_SCHEMA) return null;

  const [settings] = await db.query(
    "SELECT active_project_id, low_balance_threshold FROM settings WHERE id = ?",
    [SETTINGS_ID],
  );
  const projectId = settings ? str(settings.active_project_id) : null;
  if (!projectId) return null;
  const [p] = await db.query("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL", [projectId]);
  if (!p) return null;

  const project: Project = {
    id: String(p.id),
    name: String(p.name),
    client: str(p.client),
    budget: num(p.budget),
    startDate: String(p.start_date),
    endDate: str(p.end_date),
    status: String(p.status) as Project["status"],
  };
  const categories: Category[] = (
    await db.query("SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY ord")
  ).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    type: String(c.type) as Category["type"],
    isDefault: num(c.is_default) === 1,
  }));
  const transactions: Transaction[] = (
    await db.query(
      // Terbaru dulu; dalam tanggal yang sama, yang terakhir dicatat/diubah di atas (ord kecil).
      "SELECT * FROM transactions WHERE project_id = ? AND deleted_at IS NULL ORDER BY transaction_date DESC, ord",
      [projectId],
    )
  ).map((t) => ({
    id: String(t.id),
    projectId: String(t.project_id),
    categoryId: String(t.category_id),
    type: String(t.type) as Transaction["type"],
    amount: num(t.amount),
    description: String(t.description ?? ""),
    transactionDate: String(t.transaction_date),
    hasReceipt: num(t.has_receipt) === 1,
    noReceipt: num(t.no_receipt) === 1,
  }));

  const cursor = meta.get(META_CURSOR);
  return {
    schema: REPLICA_SCHEMA,
    syncedAt,
    project,
    lowBalanceThreshold: num(settings.low_balance_threshold),
    categories,
    transactions,
    ...(cursor ? { cursor: Number(cursor) } : {}),
  };
}

/** Ganti seluruh isi replica di DB lokal dalam satu transaksi. */
export async function saveReplica(db: LocalDb, r: Replica): Promise<void> {
  const statements: Statement[] = [
    { sql: "DELETE FROM transactions" },
    { sql: "DELETE FROM categories" },
    { sql: "DELETE FROM projects" },
    { sql: "DELETE FROM settings" },
    {
      sql: `INSERT INTO projects (id, name, client, budget, start_date, end_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      bind: [r.project.id, r.project.name, r.project.client, r.project.budget, r.project.startDate, r.project.endDate, r.project.status],
    },
    {
      sql: "INSERT INTO settings (id, active_project_id, low_balance_threshold) VALUES (?, ?, ?)",
      bind: [SETTINGS_ID, r.project.id, r.lowBalanceThreshold],
    },
    ...r.categories.map((c, ord) => ({
      sql: "INSERT INTO categories (id, name, type, is_default, ord) VALUES (?, ?, ?, ?, ?)",
      bind: [c.id, c.name, c.type, c.isDefault ? 1 : 0, ord],
    })),
    ...r.transactions.map((t, ord) => ({
      sql: `INSERT INTO transactions
              (id, project_id, category_id, type, amount, description, transaction_date, has_receipt, no_receipt, ord)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [t.id, t.projectId, t.categoryId, t.type, t.amount, t.description, t.transactionDate, t.hasReceipt ? 1 : 0, t.noReceipt ? 1 : 0, ord],
    })),
    { sql: "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", bind: [META_SYNCED_AT, r.syncedAt] },
    { sql: "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", bind: [META_SCHEMA, String(REPLICA_SCHEMA)] },
    // Kursor disimpan dalam transaksi yang sama dengan isinya — tidak pernah lebih maju dari data.
    r.cursor === undefined
      ? { sql: "DELETE FROM meta WHERE key = ?", bind: [META_CURSOR] }
      : { sql: "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", bind: [META_CURSOR, String(r.cursor)] },
    // Penanda waktu sinkron: data tabel-tabel ini terakhir ditarik dari server pada syncedAt.
    ...PULLED_TABLES.map((table) => ({
      sql: `INSERT INTO sync_state (table_name, last_pulled_at) VALUES (?, ?)
            ON CONFLICT (table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
      bind: [table, r.syncedAt],
    })),
  ];
  await db.batch(statements);
}

export async function clearReplica(db: LocalDb): Promise<void> {
  await db.batch([
    { sql: "DELETE FROM transactions" },
    { sql: "DELETE FROM categories" },
    { sql: "DELETE FROM projects" },
    { sql: "DELETE FROM settings" },
    { sql: "DELETE FROM meta WHERE key IN (?, ?, ?)", bind: [META_SYNCED_AT, META_SCHEMA, META_CURSOR] },
  ]);
}

// ---- CRUD per baris (perubahan di perangkat) ---------------------------------------------
// Mencatat/mengubah/menghapus satu transaksi cukup menulis barisnya, bukan seluruh replica.

const txValues = (t: Transaction) => [
  t.id,
  t.projectId,
  t.categoryId,
  t.type,
  t.amount,
  t.description,
  t.transactionDate,
  t.hasReceipt ? 1 : 0,
  t.noReceipt ? 1 : 0,
];

/**
 * Sisipkan atau perbarui satu transaksi. Baris yang baru dicatat / diubah diberi ord terkecil
 * sehingga tampil paling atas di tanggalnya — sama dengan urutan di memori (insertSorted).
 */
export function upsertTransactionStatement(t: Transaction): Statement {
  return {
    sql: `INSERT INTO transactions
            (id, project_id, category_id, type, amount, description, transaction_date, has_receipt, no_receipt, ord, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(min(ord), 0) - 1 FROM transactions), ?)
          ON CONFLICT (id) DO UPDATE SET
            project_id = excluded.project_id,
            category_id = excluded.category_id,
            type = excluded.type,
            amount = excluded.amount,
            description = excluded.description,
            transaction_date = excluded.transaction_date,
            has_receipt = excluded.has_receipt,
            no_receipt = excluded.no_receipt,
            ord = excluded.ord,
            updated_at = excluded.updated_at,
            deleted_at = NULL`,
    bind: [...txValues(t), new Date().toISOString()],
  };
}

/**
 * Hapus di perangkat = soft delete: baris ditandai deleted_at (tidak lagi tampil) sampai
 * replica berikutnya ditarik dari server. Penghapusannya sendiri dikirim lewat antrean.
 */
export function deleteTransactionStatement(id: string): Statement {
  const now = new Date().toISOString();
  return {
    sql: "UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    bind: [now, now, id],
  };
}

export type TransactionRowChanges = { upsert: Transaction[]; remove: string[] };

/** Terapkan perubahan baris transaksi dalam satu transaksi DB. */
export async function writeTransactionRows(db: LocalDb, changes: TransactionRowChanges): Promise<void> {
  await db.batch([
    ...changes.remove.map(deleteTransactionStatement),
    ...changes.upsert.map(upsertTransactionStatement),
  ]);
}

/** Satu transaksi dari DB lokal (null bila tidak ada). */
export async function getLocalTransaction(db: LocalDb, id: string): Promise<Transaction | null> {
  const [t] = await db.query("SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL", [id]);
  if (!t) return null;
  return {
    id: String(t.id),
    projectId: String(t.project_id),
    categoryId: String(t.category_id),
    type: String(t.type) as Transaction["type"],
    amount: num(t.amount),
    description: String(t.description ?? ""),
    transactionDate: String(t.transaction_date),
    hasReceipt: num(t.has_receipt) === 1,
    noReceipt: num(t.no_receipt) === 1,
  };
}

// ---- Penanda waktu sinkronisasi ---------------------------------------------------------

export type SyncMarks = { lastPulledAt: string | null; lastPushedAt: string | null };

/** Catat bahwa perubahan perangkat berhasil dikirim ke server pada `at`. */
export async function markPushed(db: LocalDb, at: string): Promise<void> {
  await db.batch([
    {
      sql: `INSERT INTO sync_state (table_name, last_pushed_at) VALUES ('transactions', ?)
            ON CONFLICT (table_name) DO UPDATE SET last_pushed_at = excluded.last_pushed_at`,
      bind: [at],
    },
  ]);
}

export async function readSyncMarks(db: LocalDb): Promise<SyncMarks> {
  const [row] = await db.query(
    "SELECT max(last_pulled_at) AS pulled, max(last_pushed_at) AS pushed FROM sync_state",
  );
  return { lastPulledAt: row ? str(row.pulled) : null, lastPushedAt: row ? str(row.pushed) : null };
}
