// Admin: akun yang boleh mengatur ulang sandi pengguna lain tanpa verifikasi email / nomor HP
// (mis. pengguna lupa sandi dan email / WhatsApp belum bisa dipakai). Admin ditentukan env
// ADMIN_ACCOUNTS (email / nomor HP, dipisah koma) — tidak bisa didapat dari dalam aplikasi.
import { hashPassword } from "better-auth/crypto";
import { and, desc, eq, like, max, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { accounts, sessions, users } from "@/db/schema";
import { formatPhone, parseIdentifier, validateNewPassword, type NewPasswordErrors } from "@/lib/auth-rules";
import { isPhoneEmail } from "@/server/auth";
import type { SessionUser } from "@/server/session";

/** Email / nomor HP (+62…) admin dari env ADMIN_ACCOUNTS. */
function adminAccounts(): Set<string> {
  const list = (process.env.ADMIN_ACCOUNTS ?? "").split(",");
  return new Set(list.map((v) => parseIdentifier(v)?.value).filter((v): v is string => !!v));
}

export function isAdmin(user: Pick<SessionUser, "email" | "phone"> | null | undefined): boolean {
  if (!user) return false;
  const admins = adminAccounts();
  return (!!user.email && admins.has(user.email)) || (!!user.phone && admins.has(user.phone));
}

export type AdminUserRow = {
  id: string;
  name: string;
  /** Email asli (bukan email pengganti akun nomor HP) atau null. */
  email: string | null;
  phone: string | null;
  createdAt: string;
  /** Aktivitas sesi terakhir (ISO) atau null bila tidak sedang masuk di mana pun. */
  lastActiveAt: string | null;
  activeSessions: number;
};

export const ADMIN_USER_LIMIT = 200;

/** Daftar akun (terbaru dulu), disaring nama / email / nomor HP bila `query` diisi. */
export async function listUsers(query = ""): Promise<AdminUserRow[]> {
  const q = query.trim().toLowerCase();
  const phone = parseIdentifier(q)?.kind === "phone" ? parseIdentifier(q)!.value : null;
  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const filter = q
    ? or(
        sql`lower(${users.name}) like ${pattern} escape '\\'`,
        sql`${users.email} like ${pattern} escape '\\'`,
        phone ? eq(users.phoneNumber, phone) : like(users.phoneNumber, pattern),
      )
    : undefined;
  const now = new Date();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phoneNumber,
      createdAt: users.createdAt,
      lastActiveAt: max(sessions.updatedAt),
      activeSessions: sql<number>`count(${sessions.id})`,
    })
    .from(users)
    .leftJoin(sessions, and(eq(sessions.userId, users.id), sql`${sessions.expiresAt} > ${now.toISOString()}`))
    .where(filter)
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(ADMIN_USER_LIMIT);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: isPhoneEmail(r.email) ? null : r.email,
    phone: r.phone,
    createdAt: new Date(r.createdAt).toISOString(),
    lastActiveAt: r.lastActiveAt ? new Date(r.lastActiveAt).toISOString() : null,
    activeSessions: Number(r.activeSessions) || 0,
  }));
}

export type AdminSetPasswordResult =
  | { ok: true; signedOut: number }
  | { ok: false; status: 403 | 404 | 422; error?: string; fieldErrors?: NewPasswordErrors };

/**
 * Admin mengganti sandi akun lain. Semua sesi akun itu dicabut (harus masuk dengan sandi baru).
 * Sandi akun sendiri diganti lewat Pengaturan (butuh sandi saat ini).
 */
export async function adminSetPassword(
  admin: SessionUser,
  targetId: string,
  body: Record<string, unknown>,
): Promise<AdminSetPasswordResult> {
  if (targetId === admin.id) {
    return { ok: false, status: 403, error: "Sandi akunmu sendiri diganti lewat Pengaturan → Ganti kata sandi." };
  }
  const [target] = await db
    .select({ id: users.id, email: users.email, phone: users.phoneNumber })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);
  if (!target) return { ok: false, status: 404, error: "Akun tidak ditemukan." };

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const identifier = (!isPhoneEmail(target.email) && target.email) || target.phone || "";
  const errors = validateNewPassword(str(body.password), str(body.confirm), identifier);
  if (Object.keys(errors).length > 0) return { ok: false, status: 422, fieldErrors: errors };

  const hash = await hashPassword(str(body.password));
  const signedOut = await db.transaction(async (tx) => {
    const updated = await tx
      .update(accounts)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(accounts.userId, target.id), eq(accounts.providerId, "credential")))
      .returning({ id: accounts.id });
    if (updated.length === 0) {
      await tx.insert(accounts).values({
        id: crypto.randomUUID(),
        userId: target.id,
        accountId: target.id,
        providerId: "credential",
        password: hash,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    const removed = await tx.delete(sessions).where(eq(sessions.userId, target.id)).returning({ id: sessions.id });
    return removed.length;
  });
  const who = (u: { email: string | null; phone: string | null }) =>
    (!isPhoneEmail(u.email) && u.email) || (u.phone ? formatPhone(u.phone) : "?");
  console.info(`[admin] ${who(admin)} mengatur ulang sandi akun ${who(target)} (${target.id}); ${signedOut} sesi dicabut.`);
  return { ok: true, signedOut };
}
