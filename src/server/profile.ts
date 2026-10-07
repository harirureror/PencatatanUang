// Ubah profil pengguna: nama & kontak masuk (email / nomor HP).
// Mengganti kontak masuk butuh sandi saat ini (dicek terhadap hash di accounts.password).
import { verifyPassword } from "better-auth/crypto";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { contactChanged, parseIdentifier, validateProfile, type ProfileErrors } from "@/lib/auth-rules";
import { isPhoneEmail, phoneEmail } from "@/server/auth";
import { clearRateLimit, hitRateLimit, rateLimitWait } from "@/server/rate-limit";
import { toSessionUser, type SessionUser } from "@/server/session";

const MAX_PASSWORD_TRIES = 5;
const LOCK_SECONDS = 5 * 60;

export type ProfileUpdateResult =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 404 | 409 | 422 | 429; fieldErrors?: ProfileErrors; error?: string; retryAfter?: number };

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function updateProfile(userId: string, body: Record<string, unknown>): Promise<ProfileUpdateResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { ok: false, status: 404, error: "Akun tidak ditemukan." };

  const current = { email: isPhoneEmail(user.email) ? null : user.email, phone: user.phoneNumber };
  const input = { name: str(body.name), email: str(body.email), phone: str(body.phone), password: str(body.password) };
  const errors = validateProfile(input, current);
  if (Object.keys(errors).length > 0) return { ok: false, status: 422, fieldErrors: errors, error: errors.form };

  const email = input.email.trim() ? parseIdentifier(input.email)!.value : null;
  const phone = input.phone.trim() ? parseIdentifier(input.phone)!.value : null;

  // Kontak masuk berubah → sandi saat ini wajib benar (dibatasi percobaannya).
  if (contactChanged(input, current)) {
    const key = `profil-sandi:${userId}`;
    const wait = await rateLimitWait(key, MAX_PASSWORD_TRIES, LOCK_SECONDS);
    if (wait > 0) {
      return { ok: false, status: 429, retryAfter: wait, error: "Terlalu banyak percobaan sandi. Coba lagi nanti." };
    }
    const [credential] = await db
      .select({ password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
      .limit(1);
    const valid = !!credential?.password && (await verifyPassword({ hash: credential.password, password: input.password }));
    if (!valid) {
      await hitRateLimit(key, MAX_PASSWORD_TRIES, LOCK_SECONDS);
      return { ok: false, status: 422, fieldErrors: { password: "Sandi saat ini salah." } };
    }
    await clearRateLimit(key);

    // Dipakai akun lain?
    const taken: ProfileErrors = {};
    if (email && email !== current.email) {
      const [other] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, userId))).limit(1);
      if (other) taken.email = "Email ini sudah dipakai akun lain.";
    }
    if (phone && phone !== current.phone) {
      const [other] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.phoneNumber, phone), ne(users.id, userId)))
        .limit(1);
      if (other) taken.phone = "Nomor HP ini sudah dipakai akun lain.";
    }
    if (Object.keys(taken).length > 0) return { ok: false, status: 409, fieldErrors: taken };
  }

  // Akun tanpa email memakai email pengganti dari nomor HP (Better Auth butuh email unik).
  const storedEmail = email ?? phoneEmail(phone!);
  const values = {
    name: input.name.trim(),
    email: storedEmail,
    phoneNumber: phone,
    emailVerified: storedEmail === user.email ? user.emailVerified : false,
    phoneNumberVerified: phone === user.phoneNumber ? user.phoneNumberVerified : false,
    updatedAt: new Date(),
  };
  try {
    const [row] = await db.update(users).set(values).where(eq(users.id, userId)).returning();
    return { ok: true, user: toSessionUser({ ...row, email: row.email ?? storedEmail }) };
  } catch (e) {
    // Bentrok bersamaan dengan pendaftaran / perubahan akun lain.
    if (e instanceof Error && /UNIQUE constraint/i.test(`${e.message} ${String(e.cause ?? "")}`)) {
      return { ok: false, status: 409, error: "Email atau nomor HP ini baru saja dipakai akun lain." };
    }
    throw e;
  }
}
