import { APIError } from "better-auth/api";

import { validateNewPassword } from "@/lib/auth-rules";
import { auth } from "@/server/auth";
import { checkResetToken } from "@/server/password-reset";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/akun/atur-ulang-sandi?token= — status token.
 * 200 { data: { valid: true, account } } · 410 { data: { valid: false, reason: "expired"|"invalid" } }
 */
export async function GET(request: Request) {
  const status = await checkResetToken(new URL(request.url).searchParams.get("token"));
  return Response.json({ data: status }, { status: status.valid ? 200 : 410, headers: noStore });
}

/**
 * POST /api/akun/atur-ulang-sandi — simpan sandi baru. Token sekali pakai; semua sesi akun
 * dicabut (perangkat lain harus masuk ulang).
 * Body JSON: { token, password, confirm }
 * 200 { data: { account } } · 410 { error, expired: true } token tidak berlaku · 422 { fieldErrors }
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400, headers: noStore });
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const token = str(body.token);
  const status = await checkResetToken(token);
  const gone = () =>
    Response.json(
      { error: "Tautan ini sudah tidak berlaku. Minta tautan baru.", expired: true },
      { status: 410, headers: noStore },
    );
  if (!status.valid) return gone();
  const fieldErrors = validateNewPassword(str(body.password), str(body.confirm), status.account);
  if (Object.keys(fieldErrors).length > 0) return Response.json({ fieldErrors }, { status: 422, headers: noStore });
  try {
    await auth.api.resetPassword({ body: { token, newPassword: str(body.password) } });
  } catch (error) {
    if (error instanceof APIError) return gone();
    console.error("POST /api/akun/atur-ulang-sandi gagal:", error);
    return Response.json({ error: "Gagal menyimpan sandi baru. Coba lagi." }, { status: 500, headers: noStore });
  }
  return Response.json({ data: { account: status.account } }, { headers: noStore });
}
