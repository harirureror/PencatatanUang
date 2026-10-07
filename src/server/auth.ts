// Autentikasi (Better Auth): sesi, pendaftaran, masuk dengan email / nomor HP + sandi.
// Tabel: users, sessions, accounts (hash sandi), verifications, rate_limits — lihat db/schema.ts.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";

import { db } from "@/db";
import { accounts, rateLimits, sessions, users, verifications } from "@/db/schema";
import { PASSWORD_MIN } from "@/lib/auth-rules";

const MIN_SECRET_LENGTH = 32;
const DEV_SECRET = "uanglapangan-dev-only-secret-jangan-dipakai-di-produksi";

/** Kunci penanda tangan cookie sesi dari env BETTER_AUTH_SECRET (wajib di produksi). */
function authSecret(): string {
  const configured = process.env.BETTER_AUTH_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`BETTER_AUTH_SECRET belum diisi (minimal ${MIN_SECRET_LENGTH} karakter acak).`);
  }
  return DEV_SECRET;
}

/** Domain email pengganti untuk akun yang daftar dengan nomor HP (.invalid tak bisa menerima email). */
export const PHONE_EMAIL_DOMAIN = "hp.uanglapangan.invalid";

/** "+6281234567890" → "6281234567890@hp.uanglapangan.invalid" */
export const phoneEmail = (e164: string) => `${e164.replace(/\D/g, "")}@${PHONE_EMAIL_DOMAIN}`;
export const isPhoneEmail = (email: string | null | undefined) => !!email?.endsWith(`@${PHONE_EMAIL_DOMAIN}`);

export const auth = betterAuth({
  appName: "UangLapangan",
  secret: authSecret(),
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: 128,
    autoSignIn: true,
    // Token atur ulang sandi dibuat src/server/password-reset.ts; setelah sandi diganti, semua
    // sesi di perangkat lain dicabut (harus masuk ulang dengan sandi baru).
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 hari
    updateAge: 60 * 60 * 24, // diperpanjang paling sering sehari sekali
    // Tanpa cache sesi di cookie: sesi selalu dicek ke database, jadi keluar / sesi dicabut
    // langsung berlaku (cookie lama yang tersalin tidak bisa dipakai lagi).
    cookieCache: { enabled: false },
  },
  rateLimit: { enabled: true, storage: "database" },
  // Pendaftaran hanya lewat POST /api/akun/daftar (validasi + normalisasi nomor HP).
  disabledPaths: ["/sign-up/email"],
  plugins: [
    phoneNumber({
      // Verifikasi nomor HP lewat OTP belum dipakai; kode atur ulang sandi dikirim oleh
      // src/server/password-reset.ts.
      sendOTP: async () => {},
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
