// Menjalankan backup: dump data pengguna → simpan arsip → catat di riwayat (backup_archives).
// Dipakai tombol "Backup sekarang" (manual) dan job terjadwal (/api/cron/backup).
// Arsip disimpan sementara di object-storage (R2 / folder data/backups), diunggah ke Google
// Drive pribadi pengguna, lalu salinan sementara dihapus. Koneksi simulasi (dev): arsip tetap
// di object-storage.
import { and, desc, eq, gte, lt } from "drizzle-orm";

import { db } from "@/db";
import { backupArchives, users } from "@/db/schema";
import type { BackupArchive, BackupTrigger } from "@/lib/backup";
import { backupFileName, createUserDump } from "@/server/backup-dump";
import { applyRetention } from "@/server/backup-retention";
import { completeArchive, failArchive, startArchive, toBackupArchive } from "@/server/backups";
import { DriveUploadError, uploadArchiveToDrive } from "@/server/drive-api";
import { DriveNotConnectedError, isDriveConnected } from "@/server/drive-connections";
import { notifyBackupFailed, resolveBackupFailure } from "@/server/notifications";
import { deleteObject, getObject, putObject } from "@/server/object-storage";

// ---- Penyimpanan arsip sementara (R2 di produksi, folder data/backups saat dev) -------------

/** Kunci arsip; dibentuk dari id buatan server saja (tidak ada masukan pengguna). */
const archiveKey = (userId: string, archiveId: string) => `backups/${userId}/${archiveId}.zip`;

export async function readArchiveFile(userId: string, archiveId: string): Promise<Buffer | null> {
  return getObject(archiveKey(userId, archiveId));
}

export async function deleteArchiveFile(userId: string, archiveId: string): Promise<void> {
  await deleteObject(archiveKey(userId, archiveId));
}

// ---- Menjalankan satu backup ------------------------------------------------------------

/** Backup "proses" lebih lama dari ini dianggap terhenti (server mati di tengah jalan). */
const STALE_AFTER_MS = 30 * 60_000;

/** Tandai backup yang macet berstatus gagal agar tidak menghalangi backup berikutnya. */
async function failStaleArchives(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const stale = await db
    .select({ id: backupArchives.id })
    .from(backupArchives)
    .where(
      and(
        eq(backupArchives.userId, userId),
        eq(backupArchives.status, "proses"),
        lt(backupArchives.createdAt, cutoff),
      ),
    );
  for (const { id } of stale) await failArchive(id, "Backup terhenti sebelum selesai.");
}

/**
 * Jalankan satu backup untuk pengguna. Bila backup lain sedang berjalan, yang itu yang
 * dikembalikan (tidak ada dua dump bersamaan untuk satu pengguna). Gagal → pemberitahuan
 * dibuka (dan email untuk backup terjadwal); berhasil → pemberitahuan gagal ditutup.
 */
export async function runBackup(userId: string, trigger: BackupTrigger): Promise<BackupArchive> {
  const archive = await runBackupOnce(userId, trigger);
  try {
    if (archive.status === "gagal") await notifyBackupFailed(userId, archive);
    else if (archive.status === "berhasil") await resolveBackupFailure(userId);
  } catch (error) {
    console.warn("Pemberitahuan backup gagal diproses:", error);
  }
  return archive;
}

async function runBackupOnce(userId: string, trigger: BackupTrigger): Promise<BackupArchive> {
  await failStaleArchives(userId);
  const [running] = await db
    .select()
    .from(backupArchives)
    .where(and(eq(backupArchives.userId, userId), eq(backupArchives.status, "proses")))
    .limit(1);
  if (running) return toBackupArchive(running);

  let archive: BackupArchive;
  try {
    archive = await startArchive(userId, { trigger, fileName: backupFileName() }); // tanggal WIB
  } catch (error) {
    // Kalah balapan dengan permintaan lain (indeks unik "satu proses per pengguna").
    const [other] = await db
      .select()
      .from(backupArchives)
      .where(and(eq(backupArchives.userId, userId), eq(backupArchives.status, "proses")))
      .limit(1);
    if (other) return toBackupArchive(other);
    throw error;
  }
  if (!(await isDriveConnected(userId))) {
    return failArchive(archive.id, "Google Drive belum terhubung — hubungkan dulu lalu coba lagi.");
  }

  try {
    const dump = await createUserDump(userId);
    await putObject(archiveKey(userId, archive.id), dump.bytes, { contentType: "application/zip", overwrite: true });

    // Unggah ke Google Drive pengguna (koneksi simulasi: tidak diunggah, arsip tetap di server).
    const uploaded = await uploadArchiveToDrive(userId, {
      archiveId: archive.id,
      fileName: dump.fileName,
      bytes: dump.bytes,
      checksum: dump.checksum,
      sourceRev: dump.sourceRev,
    });
    const completed = await completeArchive(archive.id, {
      sizeBytes: dump.bytes.byteLength,
      checksum: dump.checksum,
      driveFileId: uploaded?.driveFileId ?? null,
      projectCount: dump.projectCount,
      transactionCount: dump.transactionCount,
      receiptCount: dump.receiptCount,
      sourceRev: dump.sourceRev,
    });
    // Sudah aman di Drive → salinan sementara di server tidak diperlukan lagi.
    if (uploaded) await deleteArchiveFile(userId, archive.id).catch(() => {});
    // Simpan N versi terbaru saja (gagal membersihkan tidak menggagalkan backup).
    await applyRetention(userId).catch((error) => console.warn("Retensi arsip gagal:", error));
    return completed;
  } catch (error) {
    await deleteArchiveFile(userId, archive.id).catch(() => {});
    if (error instanceof DriveUploadError || error instanceof DriveNotConnectedError) {
      return failArchive(archive.id, error.message);
    }
    console.error("Backup gagal:", error);
    return failArchive(archive.id, "Gagal membuat arsip backup. Akan dicoba lagi pada jadwal berikutnya.");
  }
}

// ---- Jadwal -----------------------------------------------------------------------------

/** Jadwal bawaan: tiap hari pukul 02.00 WIB (UTC+7, tanpa musim panas) = 19.00 UTC. */
export const DAILY_BACKUP_HOUR_WIB = 2;
const WIB_OFFSET_MS = 7 * 3_600_000;

/** Waktu jadwal terakhir yang sudah lewat (≤ now). */
export function lastScheduledRun(now = new Date()): Date {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const slot = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate(), DAILY_BACKUP_HOUR_WIB);
  const slotUtc = slot - WIB_OFFSET_MS;
  return new Date(slotUtc <= now.getTime() ? slotUtc : slotUtc - 86_400_000);
}

export type ScheduledRunReport = { checked: number; started: BackupArchive[]; skipped: number };

/**
 * Jalankan backup terjadwal yang jatuh tempo: pengguna yang belum punya backup terjadwal sejak
 * jadwal terakhir. Aman dipanggil berulang (mis. cron dipicu dua kali) — tidak menggandakan.
 */
export async function runDueBackups(now = new Date()): Promise<ScheduledRunReport> {
  const since = lastScheduledRun(now).toISOString();
  const all = await db.select({ id: users.id }).from(users);
  const started: BackupArchive[] = [];
  let skipped = 0;
  for (const { id: userId } of all) {
    const [done] = await db
      .select({ id: backupArchives.id })
      .from(backupArchives)
      .where(
        and(
          eq(backupArchives.userId, userId),
          eq(backupArchives.trigger, "terjadwal"),
          gte(backupArchives.createdAt, since),
        ),
      )
      .orderBy(desc(backupArchives.createdAt))
      .limit(1);
    if (done) {
      skipped++;
      continue;
    }
    started.push(await runBackup(userId, "terjadwal"));
  }
  return { checked: all.length, started, skipped };
}
