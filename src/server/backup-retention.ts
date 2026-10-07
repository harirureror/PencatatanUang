// Retensi arsip backup: simpan N versi berhasil terbaru per pengguna, hapus sisanya dari
// Google Drive (atau server, untuk koneksi simulasi) lalu dari riwayat.
// Aturan pengaman:
// - arsip berhasil terbaru tidak pernah dihapus (N minimal 1);
// - gagal menghapus file di Drive (jaringan / izin) → catatannya dipertahankan dan dicoba lagi
//   pada pembersihan berikutnya — tidak ada arsip yang "hilang" dari riwayat padahal masih ada;
// - file yang sudah dihapus pengguna sendiri dari Drive (404) → catatannya ikut dibersihkan.
import { and, desc, eq, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { backupArchives } from "@/db/schema";
import { KEEP_BACKUP_VERSIONS } from "@/lib/backup";
import { deleteArchiveFile } from "@/server/backup-runner";
import { deleteDriveFile } from "@/server/drive-api";
import { getDriveTarget } from "@/server/drive-connections";

/** Catatan backup gagal yang lebih tua dari ini dibersihkan dari riwayat. */
const FAILED_HISTORY_DAYS = 30;

export type RetentionReport = { removed: string[]; kept: string[]; failedPruned: number };

export async function applyRetention(
  userId: string,
  keepVersions = KEEP_BACKUP_VERSIONS,
  now = new Date(),
): Promise<RetentionReport> {
  const keep = Math.max(1, keepVersions);
  const successful = await db
    .select({ id: backupArchives.id, driveFileId: backupArchives.driveFileId })
    .from(backupArchives)
    .where(and(eq(backupArchives.userId, userId), eq(backupArchives.status, "berhasil")))
    .orderBy(desc(backupArchives.createdAt));
  const old = successful.slice(keep);

  const target = old.length > 0 ? await getDriveTarget(userId) : null;
  const removed: string[] = [];
  const kept: string[] = [];
  for (const archive of old) {
    let gone = true;
    if (archive.driveFileId && !archive.driveFileId.startsWith("contoh-")) {
      // File di Drive hanya bisa dihapus lewat koneksi Google yang aktif.
      gone = target?.mode === "google" ? await deleteDriveFile(userId, archive.driveFileId) : false;
    }
    if (!gone) {
      kept.push(archive.id);
      continue;
    }
    await deleteArchiveFile(userId, archive.id).catch(() => {}); // salinan di server (simulasi)
    removed.push(archive.id);
  }
  if (removed.length > 0) {
    await db.delete(backupArchives).where(and(eq(backupArchives.userId, userId), inArray(backupArchives.id, removed)));
  }

  const cutoff = new Date(now.getTime() - FAILED_HISTORY_DAYS * 86_400_000).toISOString();
  const pruned = await db
    .delete(backupArchives)
    .where(and(eq(backupArchives.userId, userId), eq(backupArchives.status, "gagal"), lt(backupArchives.createdAt, cutoff)))
    .returning({ id: backupArchives.id });

  return { removed, kept, failedPruned: pruned.length };
}
