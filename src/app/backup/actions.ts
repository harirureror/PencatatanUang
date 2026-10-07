"use server";

import { revalidatePath } from "next/cache";

import { RESTORE_CONFIRM_WORD, type BackupArchive } from "@/lib/backup";
import { runBackup } from "@/server/backup-runner";
import { restoreFromArchive as restoreArchive, RestoreError } from "@/server/backup-restore";
import { getCurrentUserId } from "@/server/current-user";
import { disconnectDrive as removeDrive, saveSimulatedConnection } from "@/server/drive-connections";
import { googleOAuthConfig } from "@/server/google-oauth";

/**
 * Backup sekarang: dump data pengguna menjadi arsip (JSON terkompresi + checksum) lalu
 * dicatat di riwayat. Unggah ke Google Drive menyusul (task unggah Drive).
 */
export async function runBackupNow(): Promise<BackupArchive> {
  const archive = await runBackup(await getCurrentUserId(), "manual");
  revalidatePath("/backup");
  revalidatePath("/sinkron");
  return archive;
}

/**
 * Hubungkan Drive dalam MODE SIMULASI — hanya mode pengembangan saat OAuth Google belum
 * dikonfigurasi. Dengan OAuth, tombol "Hubungkan" langsung menuju /api/drive/connect.
 */
export async function connectDriveSimulated(): Promise<{ error?: string }> {
  if (googleOAuthConfig()) return { error: "Gunakan login Google untuk menghubungkan Drive." };
  if (process.env.NODE_ENV === "production") {
    return { error: "Google Drive belum dikonfigurasi di server." };
  }
  await saveSimulatedConnection(await getCurrentUserId());
  revalidatePath("/backup");
  return {};
}

/** Putuskan Google Drive: izin dicabut di Google; backup otomatis berhenti, arsip di Drive tetap ada. */
export async function disconnectDrive(): Promise<void> {
  await removeDrive(await getCurrentUserId());
  revalidatePath("/backup");
  revalidatePath("/sinkron");
}

export type RestoreState = { ok?: boolean; message?: string; error?: string };

/**
 * Pulihkan data dari satu arsip: arsip diperiksa keutuhannya, (opsional) kondisi sekarang
 * dibackup dulu, lalu data diganti dalam satu transaksi. Perangkat lain menyesuaikan saat
 * sinkron berikutnya.
 */
export async function restoreFromArchive(
  _prev: RestoreState,
  formData: FormData,
): Promise<RestoreState> {
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== RESTORE_CONFIRM_WORD) {
    return { error: `Ketik ${RESTORE_CONFIRM_WORD} untuk melanjutkan.` };
  }
  try {
    const report = await restoreArchive(await getCurrentUserId(), String(formData.get("archiveId") ?? ""), {
      backupFirst: formData.get("backupFirst") === "on",
    });
    revalidatePath("/", "layout");
    const { restored } = report;
    return {
      ok: true,
      message: `${report.safetyBackup ? "Kondisi sebelumnya sudah dibackup, lalu " : ""}data dipulihkan dari arsip ${report.fileName}: ${restored.projects} proyek, ${restored.transactions} transaksi, ${restored.receipts} lampiran. Perangkat lain menyesuaikan saat sinkron berikutnya.`,
    };
  } catch (error) {
    if (error instanceof RestoreError) return { error: error.message };
    console.error("Pemulihan gagal:", error);
    return { error: "Pemulihan gagal — data tidak diubah. Coba lagi." };
  }
}
