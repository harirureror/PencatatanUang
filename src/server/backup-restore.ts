// Memulihkan data pengguna dari satu arsip backup.
//
// Urutan pengamanan:
//  1. Arsip diambil (Google Drive, atau server untuk koneksi simulasi) lalu diperiksa berlapis:
//     SHA-256 seluruh arsip = yang tercatat saat dibuat, CRC tiap file ZIP, SHA-256 tiap file
//     sesuai manifest, format/versi, dan arsip memang milik pengguna ini.
//  2. (Opsional) kondisi sekarang dibackup dulu — bila backup itu gagal, pemulihan dibatalkan.
//  3. Data diganti dalam SATU transaksi database: berhasil semua atau tidak berubah sama sekali.
//     Baris di arsip ditulis ulang (yang terhapus dihidupkan lagi); baris sekarang yang tidak ada
//     di arsip ditandai terhapus (soft delete) — bukan dihapus permanen — supaya perangkat lain
//     ikut menyesuaikan saat sinkron (semua baris yang berubah mendapat rev baru).
import { createHash } from "node:crypto";

import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, projects, receipts, settings, transactions } from "@/db/schema";
import type { BackupArchive } from "@/lib/backup";
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupDocument, type BackupManifest } from "@/server/backup-dump";
import { readArchiveFile, runBackup } from "@/server/backup-runner";
import { getArchiveRow } from "@/server/backups";
import { downloadDriveFile, DriveUploadError } from "@/server/drive-api";
import { DriveNotConnectedError } from "@/server/drive-connections";
import { isStoredKey, readReceiptFile, saveReceiptFile } from "@/server/receipt-storage";
import { readZip, ZipFormatError } from "@/server/zip";

/** Galat yang pesannya aman ditampilkan ke pengguna. */
export class RestoreError extends Error {}

export type RestoreReport = {
  archiveId: string;
  fileName: string;
  restored: { projects: number; categories: number; transactions: number; receipts: number; photos: number };
  removed: { projects: number; categories: number; transactions: number; receipts: number };
  /** Backup kondisi sebelum dipulihkan (bila diminta). */
  safetyBackup: BackupArchive | null;
};

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** Hanya satu pemulihan per pengguna pada satu waktu (dalam satu proses server). */
const restoring = new Set<string>();

/** Ambil & periksa arsip; mengembalikan isi data.json dan file-file di dalamnya. */
async function loadVerifiedArchive(userId: string, archiveId: string) {
  const row = await getArchiveRow(userId, archiveId);
  if (!row || row.status !== "berhasil") throw new RestoreError("Arsip tidak ditemukan atau tidak bisa dipakai.");
  if (!row.checksum) throw new RestoreError("Arsip ini tidak punya sidik jari (checksum) — tidak bisa dipulihkan dengan aman.");

  let bytes: Buffer | null;
  try {
    bytes = row.driveFileId ? await downloadDriveFile(userId, row.driveFileId) : await readArchiveFile(userId, row.id);
  } catch (error) {
    if (error instanceof DriveUploadError || error instanceof DriveNotConnectedError) throw new RestoreError(error.message);
    throw error;
  }
  if (!bytes) throw new RestoreError("File arsip tidak ditemukan.");
  if (sha256(bytes) !== row.checksum) {
    throw new RestoreError("Arsip berubah atau rusak sejak dibuat (checksum tidak cocok) — pemulihan dibatalkan.");
  }

  let files: Map<string, Buffer>;
  try {
    files = readZip(bytes);
  } catch (error) {
    if (error instanceof ZipFormatError) throw new RestoreError(`Arsip rusak: ${error.message}`);
    throw error;
  }
  const manifest = JSON.parse(files.get("manifest.json")?.toString("utf8") ?? "null") as BackupManifest | null;
  const dataFile = files.get("data.json");
  if (!manifest || !dataFile || manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION) {
    throw new RestoreError("Format arsip tidak dikenali.");
  }
  for (const f of manifest.files) {
    const data = files.get(f.path);
    if (!data || data.length !== f.bytes || sha256(data) !== f.sha256) {
      throw new RestoreError(`Isi arsip tidak utuh (${f.path}).`);
    }
  }
  const doc = JSON.parse(dataFile.toString("utf8")) as BackupDocument;
  if (doc.format !== BACKUP_FORMAT || doc.version !== BACKUP_VERSION) throw new RestoreError("Format data arsip tidak dikenali.");
  if (doc.userId !== userId) throw new RestoreError("Arsip ini milik akun lain.");
  return { row, doc, files };
}

/** Kolom yang selalu ditetapkan ulang saat dipulihkan (bukan dari arsip). */
function fresh<T extends { rev?: unknown; updatedAt?: unknown; deletedAt?: unknown }>(row: T, now: string) {
  const rest: Omit<T, "rev"> & { rev?: unknown } = { ...row };
  delete rest.rev; // rev diisi trigger hub
  return { ...(rest as Omit<T, "rev">), updatedAt: now, deletedAt: null };
}

export async function restoreFromArchive(
  userId: string,
  archiveId: string,
  { backupFirst }: { backupFirst: boolean },
): Promise<RestoreReport> {
  if (restoring.has(userId)) throw new RestoreError("Pemulihan lain sedang berjalan. Tunggu sampai selesai.");
  restoring.add(userId);
  try {
    const { row, doc, files } = await loadVerifiedArchive(userId, archiveId);
    const t = doc.tables;

    // Pengaman: backup kondisi sekarang dulu.
    let safetyBackup: BackupArchive | null = null;
    if (backupFirst) {
      safetyBackup = await runBackup(userId, "manual");
      if (safetyBackup.status !== "berhasil") {
        throw new RestoreError(`Backup kondisi sekarang gagal (${safetyBackup.error ?? "tanpa keterangan"}) — pemulihan dibatalkan.`);
      }
    }

    // Foto struk yang hilang dari server dikembalikan dulu (di luar transaksi; aman diulang).
    let photos = 0;
    for (const r of t.receipts) {
      if (!isStoredKey(r.fileUrl) || (await readReceiptFile(r.fileUrl))) continue;
      const entry = [...files.keys()].find((p) => p.startsWith(`struk/${r.id}.`));
      if (!entry) continue;
      await saveReceiptFile(r.fileUrl, files.get(entry)!);
      photos++;
    }

    const now = new Date().toISOString();
    const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);
    const removed = await db.transaction(async (tx) => {
      // Tulis ulang isi arsip. setWhere: baris ber-id sama milik pengguna lain tidak disentuh.
      for (const p of t.projects) {
        const v = { ...fresh(p, now), userId };
        await tx.insert(projects).values(v).onConflictDoUpdate({ target: projects.id, set: v, setWhere: eq(projects.userId, userId) });
      }
      for (const c of t.categories) {
        const v = { ...fresh(c, now), userId };
        await tx.insert(categories).values(v).onConflictDoUpdate({ target: categories.id, set: v, setWhere: eq(categories.userId, userId) });
      }
      for (const x of t.transactions) {
        const v = { ...fresh(x, now), userId };
        await tx.insert(transactions).values(v).onConflictDoUpdate({ target: transactions.id, set: v, setWhere: eq(transactions.userId, userId) });
      }
      const ownTx = sql`${receipts.transactionId} IN (SELECT id FROM transactions WHERE user_id = ${userId})`;
      for (const r of t.receipts) {
        const v = fresh(r, now);
        await tx.insert(receipts).values(v).onConflictDoUpdate({ target: receipts.id, set: v, setWhere: ownTx });
      }

      // Yang sekarang ada tetapi tidak ada di arsip → ditandai terhapus (urutan menjaga aturan
      // database: lampiran & catatan dulu, baru kategori & proyek).
      const gone = { deletedAt: now, updatedAt: now };
      const rRemoved = await tx
        .update(receipts)
        .set(gone)
        .where(and(isNull(receipts.deletedAt), ownTx, notInArray(receipts.id, ids(t.receipts))))
        .returning({ id: receipts.id });
      const tRemoved = await tx
        .update(transactions)
        .set(gone)
        .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt), notInArray(transactions.id, ids(t.transactions))))
        .returning({ id: transactions.id });
      const cRemoved = await tx
        .update(categories)
        .set(gone)
        .where(and(eq(categories.userId, userId), isNull(categories.deletedAt), notInArray(categories.id, ids(t.categories))))
        .returning({ id: categories.id });

      // Pengaturan (proyek aktif, ambang saldo) dari arsip, lalu proyek yang tidak ada di arsip.
      for (const s of t.settings) {
        const v = { ...fresh(s, now), userId };
        await tx.insert(settings).values(v).onConflictDoUpdate({ target: settings.userId, set: { ...v, id: undefined } });
      }
      if (t.settings.length === 0) {
        await tx.update(settings).set({ activeProjectId: null }).where(eq(settings.userId, userId));
      }
      const pRemoved = await tx
        .update(projects)
        .set(gone)
        .where(and(eq(projects.userId, userId), isNull(projects.deletedAt), notInArray(projects.id, ids(t.projects))))
        .returning({ id: projects.id });

      // Pastikan semua baris arsip kini hidup & milik pengguna ini — tidak ada yang terlewat
      // karena id-nya dipakai akun lain (setWhere melewatinya diam-diam).
      const live = async (table: typeof projects | typeof categories | typeof transactions, list: string[]) => {
        if (list.length === 0) return 0;
        const [r] = await tx
          .select({ n: sql<number>`count(*)` })
          .from(table)
          .where(and(eq(table.userId, userId), isNull(table.deletedAt), inArray(table.id, list)));
        return Number(r.n);
      };
      const [liveReceipts] = t.receipts.length
        ? await tx
            .select({ n: sql<number>`count(*)` })
            .from(receipts)
            .where(and(ownTx, isNull(receipts.deletedAt), inArray(receipts.id, ids(t.receipts))))
        : [{ n: 0 }];
      if (
        (await live(projects, ids(t.projects))) !== t.projects.length ||
        (await live(categories, ids(t.categories))) !== t.categories.length ||
        (await live(transactions, ids(t.transactions))) !== t.transactions.length ||
        Number(liveReceipts.n) !== t.receipts.length
      ) {
        throw new RestoreError("Sebagian data arsip bentrok dengan data akun lain — pemulihan dibatalkan.");
      }

      return {
        projects: pRemoved.length,
        categories: cRemoved.length,
        transactions: tRemoved.length,
        receipts: rRemoved.length,
      };
    });

    return {
      archiveId: row.id,
      fileName: row.fileName,
      restored: {
        projects: t.projects.length,
        categories: t.categories.length,
        transactions: t.transactions.length,
        receipts: t.receipts.length,
        photos,
      },
      removed,
      safetyBackup,
    };
  } finally {
    restoring.delete(userId);
  }
}
