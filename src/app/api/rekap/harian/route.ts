import { noStore, rekapResponse } from "@/server/rekap-request";

/**
 * GET /api/rekap/harian?tanggal=YYYY-MM-DD&proyek=<id> — ringkasan rekap satu hari: total
 * pemasukan & pengeluaran, sisa dana di akhir hari, kelengkapan nota, per kategori, daftar
 * catatan hari itu, jumlah catatan per hari di minggu yang sama, dan pembanding kemarin.
 * Bawaan: hari ini (WIB) dan proyek aktif.
 * 200 { data: RekapData } · 400 tanggal tidak valid · 404 proyek tidak ditemukan / milik pengguna lain
 */
export async function GET(request: Request) {
  try {
    return await rekapResponse(request, "harian");
  } catch (error) {
    console.error("GET /api/rekap/harian gagal:", error);
    return Response.json({ error: "Gagal memuat rekap harian." }, { status: 500, headers: noStore });
  }
}
