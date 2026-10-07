import { getCurrentUserId } from "@/server/current-user";
import { resetUserSettings } from "@/server/settings";

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/settings/reset — kembalikan pengaturan ke bawaan: mata uang IDR, format angka id-ID,
 * batas saldo menipis Rp1.000.000. Proyek aktif, kategori, proyek, dan catatan tidak berubah.
 * (Tema tampilan disimpan per perangkat — direset di browser.)
 * 200 { data: { currency, numberFormat, lowBalanceThreshold } }
 */
export async function POST() {
  try {
    const data = await resetUserSettings(await getCurrentUserId());
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("POST /api/settings/reset gagal:", error);
    return Response.json({ error: "Gagal mengembalikan pengaturan bawaan." }, { status: 500, headers: noStore });
  }
}
