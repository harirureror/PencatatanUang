// Validasi query string endpoint rekap (?tanggal=, ?proyek=) yang dipakai bersama.
import { todayISO } from "@/lib/format";
import type { RekapData, RekapPeriod } from "@/lib/rekap";
import { getCurrentUserId } from "@/server/current-user";
import { getActiveProject } from "@/server/projects";
import { getRekap } from "@/server/rekap";

export const noStore = { "Cache-Control": "no-store" };

/** YYYY-MM-DD yang benar-benar ada di kalender (2026-02-30 ditolak). */
export const isRealDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/**
 * Rekap harian / mingguan dari query `tanggal` (bawaan hari ini WIB, tidak boleh di masa depan)
 * dan `proyek` (bawaan proyek aktif). Hasilnya Response siap kirim (200 / 400 / 404).
 */
export async function rekapResponse(request: Request, period: Exclude<RekapPeriod, "rentang">): Promise<Response> {
  const userId = await getCurrentUserId();
  const params = new URL(request.url).searchParams;
  const today = todayISO();
  const date = params.get("tanggal") ?? today;
  if (!isRealDate(date)) {
    return Response.json({ error: "Tanggal harus berformat YYYY-MM-DD." }, { status: 400, headers: noStore });
  }
  if (date > today) {
    return Response.json({ error: "Tanggal tidak boleh melewati hari ini." }, { status: 400, headers: noStore });
  }
  const projectId = params.get("proyek") ?? (await getActiveProject(userId))?.id;
  const data: RekapData | null = projectId ? await getRekap(userId, { projectId, period, date }) : null;
  if (!data) return Response.json({ error: "Proyek tidak ditemukan." }, { status: 404, headers: noStore });
  return Response.json({ data }, { headers: noStore });
}
