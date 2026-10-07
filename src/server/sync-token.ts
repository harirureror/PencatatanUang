// Token sinkron berumur pendek per perangkat (PRD Fase 6, "Token Sync Aman").
//
// Kenapa bukan token Turso langsung: token database Turso berlaku untuk SELURUH database
// (semua pengguna) dan tidak bisa dibatasi per akun. Bila ditanam / dibagikan ke APK atau
// PWA, siapa pun yang mengambilnya bisa membaca data orang lain. Jadi kunci Turso hanya ada
// di server, dan perangkat memakai token ini untuk memanggil /api/sync/* — server yang
// menyaring data per pengguna.
//
// Format: JWT HS256 { sub: userId, dev: deviceId, scope: "sync", iat, exp }.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Masa berlaku token (detik). Perangkat meminta token baru sebelum / saat kedaluwarsa. */
export const SYNC_TOKEN_TTL_SECONDS = 15 * 60;
const MIN_SECRET_LENGTH = 32;

export class SyncTokenConfigError extends Error {}

let devSecret: string | null = null;

/**
 * Kunci penanda tangan dari env SYNC_TOKEN_SECRET (min. 32 karakter). Di mode dev boleh
 * kosong: dipakai kunci acak sementara (token lama tidak berlaku setelah server restart —
 * perangkat cukup meminta token baru).
 */
function secret(): string {
  const configured = process.env.SYNC_TOKEN_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new SyncTokenConfigError(
      `SYNC_TOKEN_SECRET belum diisi (minimal ${MIN_SECRET_LENGTH} karakter acak).`,
    );
  }
  if (!devSecret) {
    devSecret = randomBytes(32).toString("base64url");
    console.warn("SYNC_TOKEN_SECRET kosong — memakai kunci sementara (hanya mode dev).");
  }
  return devSecret;
}

const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const sign = (data: string) => createHmac("sha256", secret()).update(data).digest();
const HEADER = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export type SyncTokenClaims = { userId: string; deviceId: string; expiresAt: number };

export function issueSyncToken(
  userId: string,
  deviceId: string,
  now = Date.now(),
): { token: string; expiresAt: string } {
  const iat = Math.floor(now / 1000);
  const exp = iat + SYNC_TOKEN_TTL_SECONDS;
  const payload = b64(JSON.stringify({ sub: userId, dev: deviceId, scope: "sync", iat, exp }));
  const signature = b64(sign(`${HEADER}.${payload}`));
  return { token: `${HEADER}.${payload}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export type VerifyResult = SyncTokenClaims | { error: "invalid" | "expired" };

export function verifySyncToken(token: string, now = Date.now()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== HEADER) return { error: "invalid" };
  const [header, payload, signature] = parts;

  const expected = sign(`${header}.${payload}`);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { error: "invalid" };
  }

  let claims: { sub?: unknown; dev?: unknown; scope?: unknown; exp?: unknown };
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { error: "invalid" };
  }
  if (
    typeof claims.sub !== "string" ||
    typeof claims.dev !== "string" ||
    claims.scope !== "sync" ||
    typeof claims.exp !== "number"
  ) {
    return { error: "invalid" };
  }
  if (claims.exp * 1000 <= now) return { error: "expired" };
  return { userId: claims.sub, deviceId: claims.dev, expiresAt: claims.exp * 1000 };
}
