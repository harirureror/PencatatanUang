// Ganti sandi dari Pengaturan (pengguna sudah masuk dan tahu sandi saat ini).
// Sandi saat ini dicek terhadap hash di accounts.password (dibatasi percobaannya, sama dengan
// form profil); setelah diganti, sesi di perangkat lain dicabut — perangkat ini tetap masuk.
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { accounts, sessions, users } from "@/db/schema";
import { validateChangePassword, type ChangePasswordErrors } from "@/lib/auth-rules";
import { isPhoneEmail } from "@/server/auth";
import { clearRateLimit, hitRateLimit, rateLimitWait } from "@/server/rate-limit";

const MAX_PASSWORD_TRIES = 5;
const LOCK_SECONDS = 5 * 60;

export type PasswordChangeResult =
  | { ok: true; signedOut: number }
  | { ok: false; status: 404 | 422 | 429; fieldErrors?: ChangePasswordErrors; error?: string; retryAfter?: number };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * @param sessionToken token sesi yang sedang dipakai (tidak ikut dicabut).
 * @returns jumlah sesi perangkat lain yang dicabut.
 */
export async function changePassword(
  userId: string,
  sessionToken: string,
  body: Record<string, unknown>,
): Promise<PasswordChangeResult> {
  const [user] = await db
    .select({ email: users.email, phone: users.phoneNumber })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [credential] = await db
    .select({ id: accounts.id, password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  if (!user || !credential?.password) return { ok: false, status: 404, error: "Akun ini tidak memakai kata sandi." };

  const input = { current: str(body.current), password: str(body.password), confirm: str(body.confirm) };
  const identifier = (!isPhoneEmail(user.email) && user.email) || user.phone || "";
  const errors = validateChangePassword(input, identifier);
  if (Object.keys(errors).length > 0) return { ok: false, status: 422, fieldErrors: errors };

  const key = `ganti-sandi:${userId}`;
  const wait = await rateLimitWait(key, MAX_PASSWORD_TRIES, LOCK_SECONDS);
  if (wait > 0) {
    return { ok: false, status: 429, retryAfter: wait, error: "Terlalu banyak percobaan sandi. Coba lagi nanti." };
  }
  if (!(await verifyPassword({ hash: credential.password, password: input.current }))) {
    await hitRateLimit(key, MAX_PASSWORD_TRIES, LOCK_SECONDS);
    return { ok: false, status: 422, fieldErrors: { current: "Kata sandi saat ini salah." } };
  }
  await clearRateLimit(key);

  const hash = await hashPassword(input.password);
  const removed = await db.transaction(async (tx) => {
    await tx.update(accounts).set({ password: hash, updatedAt: new Date() }).where(eq(accounts.id, credential.id));
    return tx
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.token, sessionToken)))
      .returning({ id: sessions.id });
  });
  return { ok: true, signedOut: removed.length };
}
