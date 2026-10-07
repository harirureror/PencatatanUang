// Ringkasan halaman Backup. Koneksi Google Drive dari database (src/server/drive-connections.ts)
// dan riwayat arsip dari backup_archives; jadwal masih tetap (harian 02.00 WIB, simpan 7 versi)
// sampai pengaturan jadwal dikerjakan.
import { KEEP_BACKUP_VERSIONS, type BackupArchive } from "@/lib/backup";
import { lastScheduledRun } from "@/server/backup-runner";
import { listArchives } from "@/server/backups";
import { getDriveStatus, type DriveStatus } from "@/server/drive-connections";

export type BackupOverview = {
  drive: DriveStatus;
  schedule: { frequency: "harian" | "mingguan"; time: string; keepVersions: number };
  nextRunAt: string | null;
  archives: BackupArchive[];
};

/** Ringkasan backup: koneksi Drive, jadwal, dan riwayat arsip pengguna (terbaru dulu). */
export async function getBackupOverview(userId: string): Promise<BackupOverview> {
  const [drive, archives] = await Promise.all([getDriveStatus(userId), listArchives(userId)]);
  const next = new Date(lastScheduledRun().getTime() + 86_400_000).toISOString();
  return {
    drive,
    schedule: { frequency: "harian", time: "02.00", keepVersions: KEEP_BACKUP_VERSIONS },
    nextRunAt: drive.connected ? next : null,
    archives,
  };
}
