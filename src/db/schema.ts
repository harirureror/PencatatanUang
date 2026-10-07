// Skema database UangLapangan (SQLite via Drizzle), mengikuti PRD bagian 6.
// Catatan penyimpangan dari PRD:
// - Nominal uang disimpan INTEGER (Rupiah utuh), bukan REAL, agar tidak ada galat pembulatan.
// - Sandi tidak disimpan di `users`; Better Auth (Fase 4) menyimpannya di `accounts.password`.
// - `settings.active_project_id` menandai proyek yang sedang dicatat (Pindah Proyek Aktif).
// - Tabel `receipts` (Fase 2, Bukti Struk) menambah `mime_type` & `size_bytes` untuk validasi
//   unggahan dan backup. `transactions.has_receipt` diturunkan dari ada/tidaknya baris receipts
//   (dijaga trigger), sedangkan tanda "tanpa struk" disimpan terpisah di `no_receipt`.
// - Kolom sinkronisasi multi-perangkat (PRD Fase 6, "Catatan Kolom untuk Sinkronisasi"):
//   tabel yang disinkronkan (projects, categories, transactions, receipts, settings) memakai
//   id UUID buatan perangkat, `updated_at` (versi terakhir, "yang terbaru menang") dan
//   `deleted_at` (soft delete agar perangkat lain ikut menghapus). Skema yang sama dipakai DB
//   pusat dan DB lokal perangkat. `updated_at` juga dinaikkan trigger (drizzle/0007) untuk
//   perubahan yang tidak lewat Drizzle, mis. trigger has_receipt.
// - `rev`: nomor revisi dari hub (DB pusat / Turso), naik tiap baris berubah (trigger
//   drizzle/0010). Perangkat menarik perubahan dengan `rev > kursor terakhir` — urutannya
//   pasti sama dengan urutan commit, tidak bergantung jam (updated_at dipakai untuk "yang
//   terbaru menang" saat bentrok, bukan sebagai kursor).
import { relations, sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const timestamp = (name: string) =>
  text(name)
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/**
 * Nilai bawaan updated_at untuk kolom yang ditambahkan belakangan (SQLite tidak mengizinkan
 * default non-konstan pada ADD COLUMN). Aplikasi selalu mengisi waktu sebenarnya; trigger
 * menggantinya bila baris disisipkan tanpa nilai.
 */
export const EPOCH_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const nowISO = () => new Date().toISOString();

/** updated_at untuk tabel lama yang ditambah kolom ini lewat ADD COLUMN. */
const addedUpdatedAt = () =>
  text("updated_at").notNull().default(EPOCH_TIMESTAMP).$defaultFn(nowISO).$onUpdateFn(nowISO);
/** Soft delete: diisi waktu penghapusan; baris tetap ada agar penghapusan ikut tersinkron. */
const deletedAt = () => text("deleted_at");
/** Nomor revisi hub; diisi trigger dari sync_counter, bukan oleh aplikasi. */
const rev = () => integer("rev").notNull().default(0);

/**
 * Waktu untuk tabel akun (Better Auth): Better Auth bekerja dengan objek Date, sedangkan
 * database menyimpan teks ISO seperti tabel lain (mudah dibaca & diurutkan).
 */
const isoDate = customType<{ data: Date; driverData: string }>({
  dataType: () => "text",
  toDriver: (value) => value.toISOString(),
  fromDriver: (value) => new Date(value),
});
const authTimestamp = (name: string) =>
  isoDate(name)
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$defaultFn(() => new Date());

// ---- Akun (Better Auth, Fase 4) -----------------------------------------------------------
// Nama properti mengikuti model Better Auth (user, session, account, verification, rateLimit)
// supaya adapter Drizzle-nya bisa dipakai tanpa pemetaan kolom; nama tabel & kolom tetap
// snake_case seperti tabel lain. Sandi (hash scrypt) disimpan di accounts.password untuk
// provider "credential" — tidak pernah di tabel users.

export const users = sqliteTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    /** Wajib & unik bagi Better Auth. Akun yang daftar dengan nomor HP diberi email pengganti
     *  `<nomor>@hp.uanglapangan.invalid` (domain .invalid tidak pernah bisa menerima email). */
    email: text("email").unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    /** Nomor HP format +62… (plugin phone-number Better Auth). */
    phoneNumber: text("phone"),
    phoneNumberVerified: integer("phone_verified", { mode: "boolean" }).notNull().default(false),
    createdAt: authTimestamp("created_at"),
    updatedAt: isoDate("updated_at").notNull().default(sql`'1970-01-01T00:00:00.000Z'`).$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("users_phone_unique").on(t.phoneNumber)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Token sesi (disimpan di cookie bertanda tangan). */
    token: text("token").notNull().unique(),
    expiresAt: isoDate("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at"),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "credential" = email/nomor HP + sandi. */
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    /** Hash sandi (scrypt) untuk provider "credential". */
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: isoDate("access_token_expires_at"),
    refreshTokenExpiresAt: isoDate("refresh_token_expires_at"),
    scope: text("scope"),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at"),
  },
  (t) => [
    index("accounts_user").on(t.userId),
    uniqueIndex("accounts_provider_account").on(t.providerId, t.accountId),
  ],
);

/** Token sekali pakai: tautan atur ulang sandi, kode OTP nomor HP. */
export const verifications = sqliteTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: isoDate("expires_at").notNull(),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at"),
  },
  (t) => [index("verifications_identifier").on(t.identifier)],
);

/** Batas percobaan (mis. masuk gagal berulang) — disimpan di DB agar berlaku lintas instance serverless. */
export const rateLimits = sqliteTable("rate_limits", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    client: text("client"),
    budget: integer("budget").notNull().default(0),
    startDate: text("start_date").notNull(), // YYYY-MM-DD
    endDate: text("end_date"),
    status: text("status", { enum: ["aktif", "selesai", "arsip"] })
      .notNull()
      .default("aktif"),
    createdAt: timestamp("created_at"),
    // Untuk sinkron multi-perangkat: versi terbaru menang / deteksi bentrok saat diubah.
    updatedAt: timestamp("updated_at").$onUpdateFn(nowISO),
    deletedAt: deletedAt(),
    rev: rev(),
  },
  (t) => [
    index("projects_user_idx").on(t.userId),
    index("projects_user_updated_idx").on(t.userId, t.updatedAt),
    index("projects_user_rev_idx").on(t.userId, t.rev),
    check("projects_name_not_blank", sql`length(trim(${t.name})) > 0`),
    check("projects_budget_nonnegative", sql`${t.budget} >= 0`),
    check("projects_status_valid", sql`${t.status} IN ('aktif', 'selesai', 'arsip')`),
    // Tanggal YYYY-MM-DD (sama dengan validasi aplikasi), selesai tidak sebelum mulai.
    check("projects_start_date_valid", sql`date(${t.startDate}) IS ${t.startDate}`),
    check(
      "projects_end_date_valid",
      sql`${t.endDate} IS NULL OR (date(${t.endDate}) IS ${t.endDate} AND ${t.endDate} >= ${t.startDate})`,
    ),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    // NULL untuk kategori bawaan sistem yang berlaku bagi semua pengguna.
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: ["income", "expense"] }).notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at"),
    updatedAt: addedUpdatedAt(),
    deletedAt: deletedAt(),
    rev: rev(),
  },
  (t) => [
    index("categories_user_type_idx").on(t.userId, t.type),
    index("categories_user_updated_idx").on(t.userId, t.updatedAt),
    index("categories_rev_idx").on(t.rev),
    // Nama kategori unik per pengguna & jenis (tanpa beda huruf besar/kecil), hanya yang belum
    // dihapus. Kategori bawaan (user_id NULL) dianggap satu "pemilik".
    uniqueIndex("categories_user_type_name_unique")
      .on(sql`coalesce(${t.userId}, '')`, t.type, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
    check("categories_type_valid", sql`${t.type} IN ('income', 'expense')`),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // RESTRICT: kategori yang masih dipakai tidak boleh terhapus.
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["income", "expense"] }).notNull(),
    amount: integer("amount").notNull(),
    description: text("description").notNull().default(""),
    transactionDate: text("transaction_date").notNull(), // YYYY-MM-DD
    // Ada minimal satu foto bukti — diisi otomatis oleh trigger tabel receipts.
    hasReceipt: integer("has_receipt", { mode: "boolean" }).notNull().default(false),
    // Ditandai "tanpa struk" (nota hilang/tidak diberi). Trigger menolak tanda ini bila sudah
    // ada foto, dan melepasnya otomatis saat foto pertama ditambahkan.
    noReceipt: integer("no_receipt", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at").$onUpdateFn(nowISO),
    deletedAt: deletedAt(),
    rev: rev(),
  },
  (t) => [
    index("transactions_project_date_idx").on(t.projectId, t.transactionDate),
    index("transactions_user_updated_idx").on(t.userId, t.updatedAt),
    index("transactions_user_rev_idx").on(t.userId, t.rev),
    index("transactions_category_idx").on(t.categoryId),
    check("transactions_amount_positive", sql`${t.amount} > 0`),
    check("transactions_type_valid", sql`${t.type} IN ('income', 'expense')`),
  ],
);

export const receipts = sqliteTable(
  "receipts",
  {
    id: id(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    // Lokasi file: kunci di penyimpanan file (mis. receipts/<transaksi>/<id>.jpg) atau URL
    // publik untuk data contoh. Database hanya menyimpan referensi, bukan isi foto.
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedAt: timestamp("uploaded_at"),
    updatedAt: addedUpdatedAt(),
    deletedAt: deletedAt(),
    rev: rev(),
  },
  (t) => [
    index("receipts_transaction_idx").on(t.transactionId, t.uploadedAt),
    index("receipts_updated_idx").on(t.updatedAt),
    index("receipts_rev_idx").on(t.rev),
    check("receipts_size_positive", sql`${t.sizeBytes} > 0`),
    check("receipts_mime_image", sql`${t.mimeType} LIKE 'image/%'`),
  ],
);

export const settings = sqliteTable(
  "settings",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeProjectId: text("active_project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    currency: text("currency").notNull().default("IDR"),
    numberFormat: text("number_format").notNull().default("id-ID"),
    lowBalanceThreshold: integer("low_balance_threshold").notNull().default(1_000_000),
    updatedAt: timestamp("updated_at").$onUpdateFn(nowISO),
    deletedAt: deletedAt(),
    rev: rev(),
  },
  (t) => [uniqueIndex("settings_user_unique").on(t.userId)],
);

// ---- Metadata sinkronisasi (hanya di hub, tidak disalin ke perangkat) --------------------

/** Penghitung revisi global hub (satu baris, id = 1). */
export const syncCounter = sqliteTable(
  "sync_counter",
  {
    id: integer("id").primaryKey(),
    value: integer("value").notNull().default(0),
  },
  (t) => [check("sync_counter_single_row", sql`${t.id} = 1`)],
);

/**
 * Perangkat yang tersinkron per pengguna (HP Android, browser, desktop). id dibuat perangkat
 * (UUID). Dipakai untuk menerbitkan token sinkron per perangkat dan memantau kursor tarik.
 */
export const syncDevices = sqliteTable(
  "sync_devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    platform: text("platform", { enum: ["web", "android", "desktop"] }).notNull(),
    /** rev tertinggi yang sudah ditarik perangkat ini. */
    lastPulledRev: integer("last_pulled_rev").notNull().default(0),
    lastPulledAt: text("last_pulled_at"),
    lastPushedAt: text("last_pushed_at"),
    lastSeenAt: text("last_seen_at"),
    createdAt: timestamp("created_at"),
    /** Diisi saat akses perangkat dicabut (token sinkron tidak lagi diterbitkan). */
    revokedAt: text("revoked_at"),
  },
  (t) => [
    index("sync_devices_user_idx").on(t.userId),
    check("sync_devices_platform_valid", sql`${t.platform} IN ('web', 'android', 'desktop')`),
  ],
);

// ---- Backup berkala (PRD Fase 6: dump hub → Google Drive pribadi) -------------------------

/**
 * Riwayat arsip backup per pengguna. Isi arsipnya sendiri disimpan di Google Drive pengguna;
 * tabel ini hanya metadata untuk riwayat, pemulihan, dan pembersihan versi lama.
 */
export const backupArchives = sqliteTable(
  "backup_archives",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Dipicu jadwal harian/mingguan atau tombol "Backup sekarang". */
    trigger: text("trigger", { enum: ["terjadwal", "manual"] }).notNull(),
    status: text("status", { enum: ["proses", "berhasil", "gagal"] }).notNull().default("proses"),
    fileName: text("file_name").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** SHA-256 isi arsip (hex) — diperiksa sebelum memulihkan. */
    checksum: text("checksum"),
    /** id file di Google Drive (kosong bila gagal sebelum terunggah). */
    driveFileId: text("drive_file_id"),
    projectCount: integer("project_count").notNull().default(0),
    transactionCount: integer("transaction_count").notNull().default(0),
    receiptCount: integer("receipt_count").notNull().default(0),
    /** rev hub saat data diambil — titik waktu persis yang dikembalikan saat dipulihkan. */
    sourceRev: integer("source_rev"),
    error: text("error"),
    createdAt: timestamp("created_at"),
    completedAt: text("completed_at"),
  },
  (t) => [
    index("backup_archives_user_created_idx").on(t.userId, t.createdAt),
    // Paling banyak satu backup berjalan per pengguna (dua permintaan bersamaan tidak lolos).
    uniqueIndex("backup_archives_one_running").on(t.userId).where(sql`${t.status} = 'proses'`),
    check("backup_archives_trigger_valid", sql`${t.trigger} IN ('terjadwal', 'manual')`),
    check("backup_archives_status_valid", sql`${t.status} IN ('proses', 'berhasil', 'gagal')`),
    check(
      "backup_archives_counts_nonnegative",
      sql`${t.sizeBytes} >= 0 AND ${t.projectCount} >= 0 AND ${t.transactionCount} >= 0 AND ${t.receiptCount} >= 0`,
    ),
    // Selesai (berhasil/gagal) harus punya waktu selesai; gagal harus punya alasan.
    check(
      "backup_archives_completion",
      sql`(${t.status} = 'proses') = (${t.completedAt} IS NULL) AND (${t.status} <> 'gagal' OR ${t.error} IS NOT NULL)`,
    ),
  ],
);

/**
 * Koneksi Google Drive per pengguna (tujuan backup). Token disimpan TERENKRIPSI (AES-256-GCM,
 * src/server/secret-box.ts) dan tidak pernah dikirim ke perangkat. Izin yang diminta hanya
 * drive.file — aplikasi hanya bisa mengakses file buatannya sendiri.
 * mode "simulasi": hanya untuk pengembangan bila OAuth Google belum dikonfigurasi.
 */
export const driveConnections = sqliteTable(
  "drive_connections",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["google", "simulasi"] }).notNull(),
    accountEmail: text("account_email").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    accessTokenEnc: text("access_token_enc"),
    accessExpiresAt: text("access_expires_at"),
    scope: text("scope"),
    /** Folder "UangLapangan Backup" di Drive pengguna (dibuat saat unggah pertama). */
    folderId: text("folder_id"),
    /** "perlu_dihubungkan": Google menolak token (izin dicabut / kedaluwarsa). */
    status: text("status", { enum: ["aktif", "perlu_dihubungkan"] }).notNull().default("aktif"),
    error: text("error"),
    connectedAt: timestamp("connected_at"),
    updatedAt: timestamp("updated_at").$onUpdateFn(nowISO),
  },
  (t) => [
    check("drive_connections_mode_valid", sql`${t.mode} IN ('google', 'simulasi')`),
    check("drive_connections_status_valid", sql`${t.status} IN ('aktif', 'perlu_dihubungkan')`),
    check(
      "drive_connections_google_token",
      sql`${t.mode} <> 'google' OR ${t.refreshTokenEnc} IS NOT NULL`,
    ),
  ],
);

/**
 * Pemberitahuan untuk pengguna (saat ini: backup gagal). Paling banyak satu yang masih terbuka
 * per jenis — kegagalan beruntun memperbarui yang sama (count, isi terbaru) supaya tidak
 * membanjiri; ditutup otomatis (resolved_at) saat masalahnya selesai.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["backup_gagal"] }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Halaman untuk menindaklanjuti, mis. /backup. */
    link: text("link"),
    /** Berapa kali kejadian berulang sejak pemberitahuan ini dibuka. */
    count: integer("count").notNull().default(1),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at").$onUpdateFn(nowISO),
    /** Ditutup pengguna (muncul lagi bila kejadian berulang). */
    readAt: text("read_at"),
    /** Masalahnya sudah selesai (mis. backup berikutnya berhasil). */
    resolvedAt: text("resolved_at"),
    /** Sudah dikirim lewat email (sekali per rangkaian kegagalan). */
    emailedAt: text("emailed_at"),
  },
  (t) => [
    uniqueIndex("notifications_one_open").on(t.userId, t.kind).where(sql`${t.resolvedAt} IS NULL`),
    check("notifications_kind_valid", sql`${t.kind} IN ('backup_gagal')`),
    check("notifications_count_positive", sql`${t.count} >= 1`),
  ],
);

// Relasi untuk query relasional Drizzle (db.query.*). Aturan yang tidak bisa dinyatakan lewat
// foreign key — pemilik transaksi = pemilik proyek, proyek aktif milik sendiri & tidak diarsip —
// dijaga trigger di drizzle/0005_project_relations.sql.
export const usersRelations = relations(users, ({ many, one }) => ({
  projects: many(projects),
  transactions: many(transactions),
  categories: many(categories),
  settings: one(settings),
  syncDevices: many(syncDevices),
  backupArchives: many(backupArchives),
  driveConnection: one(driveConnections),
}));

export const driveConnectionsRelations = relations(driveConnections, ({ one }) => ({
  user: one(users, { fields: [driveConnections.userId], references: [users.id] }),
}));

export const backupArchivesRelations = relations(backupArchives, ({ one }) => ({
  user: one(users, { fields: [backupArchives.userId], references: [users.id] }),
}));

export const syncDevicesRelations = relations(syncDevices, ({ one }) => ({
  user: one(users, { fields: [syncDevices.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  project: one(projects, { fields: [transactions.projectId], references: [projects.id] }),
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  receipts: many(receipts),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  transaction: one(transactions, {
    fields: [receipts.transactionId],
    references: [transactions.id],
  }),
}));

export const settingsRelations = relations(settings, ({ one }) => ({
  user: one(users, { fields: [settings.userId], references: [users.id] }),
  activeProject: one(projects, { fields: [settings.activeProjectId], references: [projects.id] }),
}));

export type UserRow = typeof users.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type ReceiptRow = typeof receipts.$inferSelect;
export type SyncDeviceRow = typeof syncDevices.$inferSelect;
export type BackupArchiveRow = typeof backupArchives.$inferSelect;
export type DriveConnectionRow = typeof driveConnections.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
