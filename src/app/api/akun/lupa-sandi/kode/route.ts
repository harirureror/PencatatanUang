import { parseIdentifier, RESET_CODE_LENGTH } from "@/lib/auth-rules";
import { verifyResetCode } from "@/server/password-reset";

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/akun/lupa-sandi/kode — tukar kode dari WhatsApp dengan token atur ulang sandi.
 * Kode berlaku 10 menit, maksimal 5 kali salah (setelah itu minta kode baru).
 * Body JSON: { identifier, code }
 * 200 { data: { token } } · 400 { error } kode salah / kedaluwarsa · 422 { error } format salah
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400, headers: noStore });
  }
  const id = parseIdentifier(typeof body.identifier === "string" ? body.identifier : "");
  const code = typeof body.code === "string" ? body.code : "";
  if (id?.kind !== "phone" || code.length !== RESET_CODE_LENGTH || !/^\d+$/.test(code)) {
    return Response.json({ error: `Masukkan ${RESET_CODE_LENGTH} digit kode.` }, { status: 422, headers: noStore });
  }
  const token = await verifyResetCode(id.value, code);
  if (!token) return Response.json({ error: "Kode salah atau sudah tidak berlaku." }, { status: 400, headers: noStore });
  return Response.json({ data: { token } }, { headers: noStore });
}
