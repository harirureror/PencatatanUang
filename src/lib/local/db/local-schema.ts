// Skema SQLite di perangkat (DB lokal). Kolomnya mengikuti tabel pusat (src/db/schema.ts):
// id UUID, updated_at & deleted_at untuk sinkronisasi — tanpa kolom milik server (user_id,
// lokasi file, dsb.).
//
// Migrasi versi: versi skema perangkat disimpan di PRAGMA user_version. Saat DB dibuka,
// worker menjalankan langkah yang belum diterapkan secara berurutan, masing-masing dalam satu
// transaksi (gagal → dibatalkan utuh). Aturan menambah versi:
// - tambahkan langkah BARU di akhir daftar; jangan ubah / hapus langkah yang sudah dirilis
//   (perangkat lama masih harus menjalankannya dari awal);
// - utamakan perubahan yang menjaga data (ALTER TABLE ADD COLUMN, CREATE TABLE/INDEX);
// - DB perangkat hanya salinan data server (antrean offline disimpan terpisah), jadi bila
//   migrasi gagal worker membangun ulang DB dari nol lalu data ditarik lagi dari server.

export const LOCAL_MIGRATIONS: string[][] = [
  // 1 — tabel salinan proyek aktif
  [
    `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client TEXT,
      budget INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT NOT NULL,
      updated_at TEXT,
      deleted_at TEXT
    )`,
    `CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      is_default INTEGER NOT NULL DEFAULT 0,
      ord INTEGER NOT NULL,
      updated_at TEXT,
      deleted_at TEXT
    )`,
    `CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      description TEXT NOT NULL DEFAULT '',
      transaction_date TEXT NOT NULL,
      has_receipt INTEGER NOT NULL DEFAULT 0,
      no_receipt INTEGER NOT NULL DEFAULT 0,
      ord INTEGER NOT NULL,
      updated_at TEXT,
      deleted_at TEXT
    )`,
    `CREATE INDEX transactions_project_ord_idx ON transactions (project_id, ord)`,
    `CREATE TABLE receipts (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      updated_at TEXT,
      deleted_at TEXT
    )`,
    `CREATE TABLE settings (
      id TEXT PRIMARY KEY,
      active_project_id TEXT,
      low_balance_threshold INTEGER NOT NULL,
      updated_at TEXT,
      deleted_at TEXT
    )`,
  ],
  // 2 — status sinkron per tabel untuk menarik perubahan sejak sinkron terakhir (Fase 6)
  [
    `CREATE TABLE sync_state (
      table_name TEXT PRIMARY KEY,
      last_pulled_at TEXT,
      last_pushed_at TEXT
    )`,
    `CREATE INDEX receipts_transaction_idx ON receipts (transaction_id)`,
  ],
];

export const LOCAL_SCHEMA_VERSION = LOCAL_MIGRATIONS.length;
