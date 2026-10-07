import { noStore, rekapResponse } from "@/server/rekap-request";

/**
 * GET /api/rekap/mingguan?tanggal=YYYY-MM-DD&proyek=<id> — ringkasan satu minggu (Senin–Minggu
 * yang memuat `tanggal`): total pemasukan & pengeluaran, sisa dana di akhir minggu, kelengkapan
 * nota, per kategori, rincian per hari (7 hari, termasuk yang kosong), daftar catatan, dan
 * pembanding minggu lalu. Bawaan: minggu ini dan proyek aktif.
 * 200 { data: RekapData } · 400 tanggal tidak valid · 404 proyek tidak ditemukan / milik pengguna lain
 */
export async function GET(request: Request) {
  try {
    return await rekapResponse(request, "mingguan");
  } catch (error) {
    console.error("GET /api/rekap/mingguan gagal:", error);
    return Response.json({ error: "Gagal memuat rekap mingguan." }, { status: 500, headers: noStore });
  }
}
