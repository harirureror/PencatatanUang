import { parseIdentifier } from "@/lib/auth-rules";
import { requestPasswordReset } from "@/server/password-reset";
import { clientIp, hitRateLimit } from "@/server/rate-limit";

const noStore = { "Cache-Control": "no-store" };
const RESEND_SECONDS = 60;
const MAX_PER_IP = 10;
const IP_WINDOW_SECONDS = 15 * 60;

/**
 * POST /api/akun/lupa-sandi — kirim tautan atur ulang sandi (email) atau kode 6 digit (nomor HP).
 * Jawaban SAMA untuk akun terdaftar maupun tidak (tidak bisa dipakai menebak akun).
 * Body JSON: { identifier }
 * 200 { data: { channel: "email"|"phone", destination, retryAfter } } · 400 body bukan JSON
 * 422 { error } format salah · 429 { error, retryAfter } minta ulang terlalu cepat
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400, headers: noStore });
  }
  const id = parseIdentifier(typeof body.identifier === "string" ? body.identifier : "");
  if (!id) return Response.json({ error: "Email atau nomor HP belum benar." }, { status: 422, headers: noStore });

  const wait =
    (await hitRateLimit(`lupa:${id.value}`, 1, RESEND_SECONDS)) ||
    (await hitRateLimit(`lupa-ip:${clientIp(request)}`, MAX_PER_IP, IP_WINDOW_SECONDS));
  if (wait > 0) {
    return Response.json(
      { error: "Tunggu sebentar sebelum meminta kirim ulang.", retryAfter: wait },
      { status: 429, headers: { ...noStore, "Retry-After": String(wait) } },
    );
  }
  try {
    await requestPasswordReset(id, process.env.BETTER_AUTH_URL ?? new URL(request.url).origin);
  } catch (error) {
    // Tetap jawab sama supaya tidak membocorkan apa pun; galat dicatat di server.
    console.error("POST /api/akun/lupa-sandi gagal:", error);
  }
  return Response.json(
    { data: { channel: id.kind, destination: id.value, retryAfter: RESEND_SECONDS } },
    { headers: noStore },
  );
}
