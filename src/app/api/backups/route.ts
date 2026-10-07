import type { BackupStatus } from "@/lib/backup";
import { getBackupOverview } from "@/lib/mock-backups";
import { countArchives, listArchives, MAX_ARCHIVE_PAGE } from "@/server/backups";
import { getCurrentUserId } from "@/server/current-user";

const noStore = { "Cache-Control": "no-store" };
const STATUSES: BackupStatus[] = ["proses", "berhasil", "gagal"];

/** Bilangan bulat ≥ 0 dari query; undefined bila kosong, NaN bila tidak valid. */
function intParam(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

/**
 * GET /api/backups — status Google Drive, jadwal, dan riwayat arsip backup pengguna
 * (terbaru dulu). Query: status? (proses|berhasil|gagal) · limit? (1–100, default 20) · offset?
 * Tiap arsip: id, waktu, pemicu (terjadwal/manual), status, file, ukuran, checksum, isi
 * (proyek/transaksi/lampiran), location ("drive" | "server" | null), error.
 * 200 { data: { drive, schedule, nextRunAt, total, archives } } · 400 query tidak valid
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const limit = intParam(params.get("limit")) ?? 20;
  const offset = intParam(params.get("offset")) ?? 0;
  if (
    (status !== null && !STATUSES.includes(status as BackupStatus)) ||
    Number.isNaN(limit) ||
    Number.isNaN(offset) ||
    limit < 1 ||
    limit > MAX_ARCHIVE_PAGE
  ) {
    return Response.json(
      { error: `Query tidak valid: status = proses|berhasil|gagal, limit = 1–${MAX_ARCHIVE_PAGE}, offset ≥ 0.` },
      { status: 400, headers: noStore },
    );
  }

  try {
    const userId = await getCurrentUserId();
    const filter = (status as BackupStatus | null) ?? undefined;
    const [{ drive, schedule, nextRunAt }, archives, total] = await Promise.all([
      getBackupOverview(userId),
      listArchives(userId, { status: filter, limit, offset }),
      countArchives(userId, filter),
    ]);
    return Response.json(
      { data: { drive, schedule, nextRunAt, total, archives } },
      { headers: noStore },
    );
  } catch (error) {
    console.error("GET /api/backups gagal:", error);
    return Response.json({ error: "Gagal memuat riwayat backup." }, { status: 500, headers: noStore });
  }
}
