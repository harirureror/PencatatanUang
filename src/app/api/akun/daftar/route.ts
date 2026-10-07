import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { parseIdentifier, validateSignUp, type SignUpInput } from "@/lib/auth-rules";
import { auth, isPhoneEmail, phoneEmail } from "@/server/auth";
import { clientIp, hitRateLimit } from "@/server/rate-limit";

const noStore = { "Cache-Control": "no-store" };
const MAX_SIGNUPS = 5;
const WINDOW_SECONDS = 15 * 60;

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * POST /api/akun/daftar — buat akun dengan email ATAU nomor HP + kata sandi, lalu langsung masuk
 * (cookie sesi ikut di respons).
 * Body JSON: { name, identifier, password, confirm }
 * 201 { data: { user: { id, name, email, phone } } } · 400 body bukan JSON
 * 409 { taken: true, fieldErrors } email / nomor sudah terdaftar · 422 { fieldErrors }
 * 429 { error, retryAfter } terlalu banyak pendaftaran dari alamat yang sama
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400, headers: noStore });
  }
  const input: SignUpInput = {
    name: str(body.name),
    identifier: str(body.identifier),
    password: str(body.password),
    confirm: str(body.confirm),
  };
  const fieldErrors = validateSignUp(input);
  const id = parseIdentifier(input.identifier);
  if (Object.keys(fieldErrors).length > 0 || !id) {
    return Response.json({ fieldErrors }, { status: 422, headers: noStore });
  }

  const retryAfter = await hitRateLimit(`daftar:${clientIp(request)}`, MAX_SIGNUPS, WINDOW_SECONDS);
  if (retryAfter > 0) {
    return Response.json(
      { error: "Terlalu banyak pendaftaran dari perangkat ini. Coba lagi nanti.", retryAfter },
      { status: 429, headers: { ...noStore, "Retry-After": String(retryAfter) } },
    );
  }

  const taken = () =>
    Response.json(
      {
        taken: true,
        fieldErrors: { identifier: `${id.kind === "email" ? "Email" : "Nomor HP"} ini sudah terdaftar.` },
      },
      { status: 409, headers: noStore },
    );
  const email = id.kind === "email" ? id.value : phoneEmail(id.value);
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(id.kind === "email" ? eq(users.email, email) : eq(users.phoneNumber, id.value))
    .limit(1);
  if (existing) return taken();

  try {
    const { headers, response } = await auth.api.signUpEmail({
      body: {
        name: input.name.trim(),
        email,
        password: input.password,
        ...(id.kind === "phone" ? { phoneNumber: id.value } : {}),
      },
      headers: request.headers,
      returnHeaders: true,
    });
    const user = response.user as typeof response.user & { phoneNumber?: string | null };
    const out = new Headers(noStore);
    for (const cookie of headers.getSetCookie()) out.append("Set-Cookie", cookie);
    return Response.json(
      {
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: isPhoneEmail(user.email) ? null : user.email,
            phone: user.phoneNumber ?? null,
          },
        },
      },
      { status: 201, headers: out },
    );
  } catch (error) {
    // Bentrok bersamaan (dua pendaftaran serentak dengan email / nomor sama).
    if (error instanceof APIError && /exist/i.test(String(error.body?.code ?? error.message))) return taken();
    if (error instanceof Error && /UNIQUE constraint/i.test(error.message + String(error.cause ?? ""))) return taken();
    console.error("POST /api/akun/daftar gagal:", error);
    return Response.json({ error: "Gagal membuat akun. Coba lagi." }, { status: 500, headers: noStore });
  }
}
