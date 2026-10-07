// Metadata arsip backup per pengguna (tabel backup_archives). Isi arsipnya di Google Drive
// pengguna; di sini riwayat, status proses, dan data untuk pemulihan / pembersihan.
import { and, count, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { backupArchives, type BackupArchiveRow } from "@/db/schema";
import type { BackupArchive, BackupStatus, BackupTrigger } from "@/lib/backup";

export function toBackupArchive(row: BackupArchiveRow): BackupArchive {
  return {
    id: row.id,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    trigger: row.trigger,
    status: row.status,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    projectCount: row.projectCount,
    transactionCount: row.transactionCount,
    receiptCount: row.receiptCount,
    location: row.driveFileId ? "drive" : row.status === "berhasil" ? "server" : null,
    ...(row.error ? { error: row.error } : {}),
  };
}

export const MAX_ARCHIVE_PAGE = 100;

/** Riwayat arsip pengguna, terbaru dulu (opsional disaring status, per halaman). */
export async function listArchives(
  userId: string,
  { status, limit = 50, offset = 0 }: { status?: BackupStatus; limit?: number; offset?: number } = {},
): Promise<BackupArchive[]> {
  const rows = await db
    .select()
    .from(backupArchives)
    .where(and(eq(backupArchives.userId, userId), status ? eq(backupArchives.status, status) : undefined))
    .orderBy(desc(backupArchives.createdAt))
    .limit(Math.min(limit, MAX_ARCHIVE_PAGE))
    .offset(offset);
  return rows.map(toBackupArchive);
}

export async function countArchives(userId: string, status?: BackupStatus): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(backupArchives)
    .where(and(eq(backupArchives.userId, userId), status ? eq(backupArchives.status, status) : undefined));
  return row?.n ?? 0;
}

export async function getArchive(userId: string, id: string): Promise<BackupArchive | null> {
  const [row] = await db
    .select()
    .from(backupArchives)
    .where(and(eq(backupArchives.id, id), eq(backupArchives.userId, userId)))
    .limit(1);
  return row ? toBackupArchive(row) : null;
}

/** Mulai satu backup: dicatat berstatus "proses" sebelum dump & unggah dimulai. */
export async function startArchive(
  userId: string,
  { trigger, fileName }: { trigger: BackupTrigger; fileName: string },
): Promise<BackupArchive> {
  const [row] = await db
    .insert(backupArchives)
    .values({ userId, trigger, fileName, status: "proses" })
    .returning();
  return toBackupArchive(row);
}

export type ArchiveResult = {
  sizeBytes: number;
  checksum: string | null;
  driveFileId: string | null;
  projectCount: number;
  transactionCount: number;
  receiptCount: number;
  sourceRev: number | null;
};

/** Backup selesai dan arsip tersimpan. */
export async function completeArchive(id: string, result: ArchiveResult): Promise<BackupArchive> {
  const [row] = await db
    .update(backupArchives)
    .set({ ...result, status: "berhasil", completedAt: new Date().toISOString(), error: null })
    .where(eq(backupArchives.id, id))
    .returning();
  return toBackupArchive(row);
}

/** Backup gagal; alasannya ditampilkan di riwayat. */
export async function failArchive(id: string, error: string): Promise<BackupArchive> {
  const [row] = await db
    .update(backupArchives)
    .set({ status: "gagal", error, completedAt: new Date().toISOString() })
    .where(eq(backupArchives.id, id))
    .returning();
  return toBackupArchive(row);
}

/** Baris arsip lengkap (termasuk id file Drive) — untuk memulihkan / membersihkan. */
export async function getArchiveRow(userId: string, id: string): Promise<BackupArchiveRow | null> {
  const [row] = await db
    .select()
    .from(backupArchives)
    .where(and(eq(backupArchives.id, id), eq(backupArchives.userId, userId)))
    .limit(1);
  return row ?? null;
}
