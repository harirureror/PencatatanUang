import { auth } from "@/server/auth";
import { changePassword } from "@/server/password-change";

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/akun/sandi — ganti kata sandi akun yang sedang masuk.
 * Body JSON: { current, password, confirm }
 * 200 { data: { signedOut } } jumlah perangkat lain yang dikeluarkan · 400 body bukan JSON
 * 401 belum masuk · 422 { fieldErrors } isian / sandi saat ini salah
 * 429 { error, retryAfter } terlalu banyak percobaan sandi
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400, headers: noStore });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sesi berakhir — silakan masuk lagi." }, { status: 401, headers: noStore });
  }
  try {
    const result = await changePassword(session.user.id, session.session.token, body);
    if (result.ok) return Response.json({ data: { signedOut: result.signedOut } }, { headers: noStore });
    const { status, fieldErrors, error, retryAfter } = result;
    return Response.json({ fieldErrors, error, retryAfter }, { status, headers: noStore });
  } catch (error) {
    console.error("POST /api/akun/sandi gagal:", error);
    return Response.json({ error: "Gagal menyimpan kata sandi baru. Coba lagi." }, { status: 500, headers: noStore });
  }
}
