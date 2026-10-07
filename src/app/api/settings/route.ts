import { getCurrentUserId } from "@/server/current-user";
import { getUserSettings, parseSettingsPatch, updateUserSettings } from "@/server/settings";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/settings — pengaturan pengguna.
 * 200 { data: { currency, numberFormat, lowBalanceThreshold } }
 */
export async function GET() {
  try {
    const data = await getUserSettings(await getCurrentUserId());
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/settings gagal:", error);
    return Response.json({ error: "Gagal memuat pengaturan." }, { status: 500, headers: noStore });
  }
}

/**
 * PATCH /api/settings — ubah sebagian pengaturan. Kunci yang tidak dikirim tidak berubah.
 * Body JSON: { currency?: "IDR"|"USD"|"SGD"|"MYR", numberFormat?: "id-ID"|"en-US",
 *              lowBalanceThreshold?: number (Rupiah, bulat ≥ 0; 0 = peringatan hanya saat minus) }
 * Nominal tetap disimpan dalam Rupiah — mata uang hanya mengubah tampilan (dikonversi dengan kurs).
 * 200 { data: { currency, numberFormat, lowBalanceThreshold } } · 400 body bukan JSON
 * 422 { error, fieldErrors } nilai tidak valid
 */
export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON." }, { status: 400, headers: noStore });
  }
  const parsed = parseSettingsPatch(body);
  if ("fieldErrors" in parsed) {
    return Response.json(
      { error: "Isian tidak valid.", fieldErrors: parsed.fieldErrors },
      { status: 422, headers: noStore },
    );
  }
  try {
    const data = await updateUserSettings(await getCurrentUserId(), parsed.patch);
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("PATCH /api/settings gagal:", error);
    return Response.json({ error: "Gagal menyimpan pengaturan." }, { status: 500, headers: noStore });
  }
}
