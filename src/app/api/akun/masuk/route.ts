import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { parseIdentifier, validateSignIn } from "@/lib/auth-rules";
import { auth } from "@/server/auth";
import { clearRateLimit, clientIp, hitRateLimit, rateLimitWait } from "@/server/rate-limit";
import { toSessionUser } from "@/server/session";

const noStore = { "Cache-Control": "no-store" };
/** Gagal berturut-turut per akun sebelum dikunci sementara. */
const MAX_FAILED = 5;
const LOCK_SECONDS = 60;
/** Batas kasar per alamat IP (menebak banyak akun sekaligus). */
const MAX_PER_IP = 30;
const IP_WINDOW_SECONDS = 15 * 60;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const locked = (retryAfter: number) =>
  Response.json(
    { error: "Terlalu banyak percobaan masuk. Tunggu sebentar lalu coba lagi.", retryAfter },
    { status: 429, headers: { ...noStore, "Retry-After": String(retryAfter) } },
  );

/**
 * POST /api/akun/masuk — masuk dengan email ATAU nomor HP + kata sandi. Berhasil: cookie sesi
 * (httpOnly, bertanda tangan; Secure di HTTPS) diset dan berlaku 30 hari.
 * Body JSON: { identifier, password }
 * 200 { data: { user } } · 400 body bukan JSON · 401 { error } akun/sandi salah (pesan sama
 * untuk keduanya) · 422 { fieldErrors } · 429 { error, retryAfter } terkunci sementara
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400, headers: noStore });
  }
  const input = { identifier: str(body.identifier), password: str(body.password) };
  const fieldErrors = validateSignIn(input);
  const id = parseIdentifier(input.identifier);
  if (Object.keys(fieldErrors).length > 0 || !id) {
    return Response.json({ fieldErrors }, { status: 422, headers: noStore });
  }

  // Kunci per akun (bukan per teks yang diketik): email & nomor HP akun yang sama berbagi hitungan.
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(id.kind === "email" ? eq(users.email, id.value) : eq(users.phoneNumber, id.value))
    .limit(1);
  const accountKey = `masuk:${account?.id ?? id.value}`;
  const wait = await rateLimitWait(accountKey, MAX_FAILED, LOCK_SECONDS);
  if (wait > 0) return locked(wait);
  const ipWait = await hitRateLimit(`masuk-ip:${clientIp(request)}`, MAX_PER_IP, IP_WINDOW_SECONDS);
  if (ipWait > 0) return locked(ipWait);

  try {
    const { headers, response } =
      id.kind === "email"
        ? await auth.api.signInEmail({
            body: { email: id.value, password: input.password, rememberMe: true },
            headers: request.headers,
            returnHeaders: true,
          })
        : await auth.api.signInPhoneNumber({
            body: { phoneNumber: id.value, password: input.password, rememberMe: true },
            headers: request.headers,
            returnHeaders: true,
          });
    await clearRateLimit(accountKey);
    const out = new Headers(noStore);
    for (const cookie of headers.getSetCookie()) out.append("Set-Cookie", cookie);
    return Response.json({ data: { user: toSessionUser(response.user as never) } }, { headers: out });
  } catch (error) {
    if (error instanceof APIError && (error.status === "UNAUTHORIZED" || error.status === "BAD_REQUEST")) {
      const retryAfter = await hitRateLimit(accountKey, MAX_FAILED, LOCK_SECONDS);
      // Percobaan ke-5 yang gagal langsung mengunci.
      const nowLocked = retryAfter > 0 || (await rateLimitWait(accountKey, MAX_FAILED, LOCK_SECONDS)) > 0;
      if (nowLocked) return locked(retryAfter || LOCK_SECONDS);
      // Pesan sama untuk akun tak dikenal & sandi salah — tidak membocorkan akun yang terdaftar.
      return Response.json({ error: "Email/nomor HP atau kata sandi salah." }, { status: 401, headers: noStore });
    }
    console.error("POST /api/akun/masuk gagal:", error);
    return Response.json({ error: "Gagal masuk. Coba lagi." }, { status: 500, headers: noStore });
  }
}
