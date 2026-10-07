import { getCurrentUserId, NotSignedInError } from "@/server/current-user";
import { updateProfile } from "@/server/profile";

const noStore = { "Cache-Control": "no-store" };

/**
 * PATCH /api/akun/profil — ubah nama & kontak masuk.
 * Body JSON: { name, email, phone, password? } — email/phone boleh kosong salah satu (minimal satu
 * terisi). `password` (sandi saat ini) wajib bila email / nomor HP berubah.
 * 200 { data: { user } } · 400 body bukan JSON · 401 belum masuk
 * 409 { fieldErrors } email / nomor dipakai akun lain · 422 { fieldErrors, error? } isian / sandi salah
 * 429 { error, retryAfter } terlalu banyak percobaan sandi
 */
export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400, headers: noStore });
  }
  try {
    const result = await updateProfile(await getCurrentUserId(), body);
    if (result.ok) return Response.json({ data: { user: result.user } }, { headers: noStore });
    const { status, fieldErrors, error, retryAfter } = result;
    return Response.json({ fieldErrors, error, retryAfter }, { status, headers: noStore });
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return Response.json({ error: "Sesi berakhir — silakan masuk lagi." }, { status: 401, headers: noStore });
    }
    console.error("PATCH /api/akun/profil gagal:", error);
    return Response.json({ error: "Gagal menyimpan profil." }, { status: 500, headers: noStore });
  }
}
