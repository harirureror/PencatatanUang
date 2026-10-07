// Lupa sandi: tautan (email) atau kode 6 digit (nomor HP) → token atur ulang sandi.
// Token disimpan di `verifications` dengan format Better Auth (`reset-password:<token>` → id
// pengguna), jadi penggantian sandinya memakai auth.api.resetPassword (hash + cabut sesi).
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { users, verifications } from "@/db/schema";
import { formatPhone, RESET_CODE_LENGTH, type Identifier } from "@/lib/auth-rules";
import { isPhoneEmail } from "@/server/auth";
import { sendEmail } from "@/server/mailer";
import { sendWhatsApp } from "@/server/whatsapp";

export const RESET_LINK_MINUTES = 30;
export const RESET_CODE_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const tokenKey = (token: string) => `reset-password:${token}`;
const codeKey = (phone: string) => `reset-hp:${phone}`;

async function findUser(id: Identifier) {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phoneNumber })
    .from(users)
    .where(id.kind === "email" ? eq(users.email, id.value) : eq(users.phoneNumber, id.value))
    .limit(1);
  return user ?? null;
}

/** Token atur ulang sandi baru untuk pengguna (berlaku RESET_LINK_MINUTES). */
async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.insert(verifications).values({
    identifier: tokenKey(token),
    value: userId,
    expiresAt: minutesFromNow(RESET_LINK_MINUTES),
  });
  return token;
}

/** Kirim kode lewat WhatsApp (Fonnte). Belum dikonfigurasi: di mode dev kode dicetak di log server. */
async function sendResetCode(phone: string, code: string): Promise<void> {
  const sent = await sendWhatsApp(
    phone,
    [
      `Kode atur ulang sandi UangLapangan: *${code}*`,
      "",
      `Berlaku ${RESET_CODE_MINUTES} menit. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari UangLapangan.`,
      "Kalau kamu tidak meminta kode ini, abaikan pesan ini.",
    ].join("\n"),
  );
  if (sent) return;
  if (process.env.NODE_ENV !== "production") {
    console.info(`[dev] Kode atur ulang sandi untuk ${phone}: ${code}`);
    return;
  }
  console.warn("Kode atur ulang sandi tidak terkirim — periksa FONNTE_TOKEN / perangkat Fonnte.");
}

/**
 * Kirim tautan (email) atau kode (nomor HP). Tidak memberi tahu apakah akun terdaftar —
 * pemanggil selalu menjawab sama.
 */
export async function requestPasswordReset(id: Identifier, appOrigin: string): Promise<void> {
  const user = await findUser(id);
  if (!user) return;
  if (id.kind === "email") {
    if (isPhoneEmail(user.email)) return;
    const token = await createResetToken(user.id);
    const link = `${appOrigin}/atur-ulang-sandi?token=${encodeURIComponent(token)}`;
    const sent = await sendEmail({
      to: id.value,
      subject: "Atur ulang kata sandi UangLapangan",
      text: [
        `Halo ${user.name},`,
        "",
        "Kami menerima permintaan untuk membuat kata sandi baru akun UangLapangan kamu.",
        `Buka tautan ini dalam ${RESET_LINK_MINUTES} menit:`,
        link,
        "",
        "Kalau kamu tidak meminta ini, abaikan email ini — sandi lama tetap berlaku.",
      ].join("\n"),
    });
    if (!sent && process.env.NODE_ENV !== "production") console.info(`[dev] Tautan atur ulang sandi: ${link}`);
    return;
  }
  const code = String(randomInt(0, 10 ** RESET_CODE_LENGTH)).padStart(RESET_CODE_LENGTH, "0");
  await db.delete(verifications).where(eq(verifications.identifier, codeKey(id.value)));
  await db.insert(verifications).values({
    identifier: codeKey(id.value),
    value: `${sha256(code)}:0`,
    expiresAt: minutesFromNow(RESET_CODE_MINUTES),
  });
  await sendResetCode(id.value, code);
}

/** Tukar kode dari SMS / WhatsApp dengan token atur ulang sandi. Null bila salah / kedaluwarsa. */
export async function verifyResetCode(phone: string, code: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(verifications)
    .where(and(eq(verifications.identifier, codeKey(phone)), gt(verifications.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  const [hash, attemptsRaw] = row.value.split(":");
  const attempts = Number(attemptsRaw);
  if (attempts >= MAX_CODE_ATTEMPTS) return null;
  const given = Buffer.from(sha256(code));
  const ok = given.length === hash.length && timingSafeEqual(given, Buffer.from(hash));
  if (!ok) {
    // Percobaan terakhir yang salah menghapus kode (harus minta kode baru).
    if (attempts + 1 >= MAX_CODE_ATTEMPTS) await db.delete(verifications).where(eq(verifications.id, row.id));
    else await db.update(verifications).set({ value: `${hash}:${attempts + 1}` }).where(eq(verifications.id, row.id));
    return null;
  }
  await db.delete(verifications).where(eq(verifications.id, row.id));
  const user = await findUser({ kind: "phone", value: phone });
  return user ? createResetToken(user.id) : null;
}

export type ResetTokenStatus = { valid: true; account: string } | { valid: false; reason: "invalid" | "expired" };

/** Status token atur ulang sandi + akun yang ditampilkan (email atau nomor HP). */
export async function checkResetToken(token: string | null | undefined): Promise<ResetTokenStatus> {
  if (!token) return { valid: false, reason: "invalid" };
  const [row] = await db.select().from(verifications).where(eq(verifications.identifier, tokenKey(token))).limit(1);
  if (!row) return { valid: false, reason: "invalid" };
  if (row.expiresAt <= new Date()) return { valid: false, reason: "expired" };
  const [user] = await db
    .select({ email: users.email, phone: users.phoneNumber })
    .from(users)
    .where(eq(users.id, row.value))
    .limit(1);
  if (!user) return { valid: false, reason: "invalid" };
  const account = !isPhoneEmail(user.email) && user.email ? user.email : user.phone ? formatPhone(user.phone) : "";
  return { valid: true, account };
}
