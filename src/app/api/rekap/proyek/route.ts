import { getCurrentUserId } from "@/server/current-user";
import { getRekapProjects } from "@/server/rekap";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/rekap/proyek — daftar proyek untuk filter Rekap: proyek aktif dulu, lalu yang
 * berjalan, selesai, dan arsip (terbaru dulu), dengan jumlah catatan dan tanggal catatan
 * pertama / terakhir (untuk rentang "seluruh proyek").
 * 200 { data: { projects: RekapProjectOption[], activeProjectId: string | null } }
 */
export async function GET() {
  try {
    const data = await getRekapProjects(await getCurrentUserId());
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/rekap/proyek gagal:", error);
    return Response.json({ error: "Gagal memuat daftar proyek." }, { status: 500, headers: noStore });
  }
}
