// Pembatas percobaan sederhana berbasis tabel rate_limits (berlaku lintas instance serverless).
// Dipakai endpoint akun yang tidak lewat router Better Auth (mis. pendaftaran).
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * Catat satu percobaan untuk `key`. Mengembalikan detik tunggu bila sudah melewati `max`
 * percobaan dalam `windowSeconds`, atau 0 bila boleh lanjut.
 */
export async function hitRateLimit(key: string, max: number, windowSeconds: number, now = Date.now()): Promise<number> {
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  const windowMs = windowSeconds * 1000;
  if (!row || now - row.lastRequest >= windowMs) {
    await db
      .insert(rateLimits)
      .values({ key, count: 1, lastRequest: now })
      .onConflictDoUpdate({ target: rateLimits.key, set: { count: 1, lastRequest: now } });
    return 0;
  }
  if (row.count >= max) return Math.ceil((row.lastRequest + windowMs - now) / 1000);
  await db.update(rateLimits).set({ count: row.count + 1 }).where(eq(rateLimits.key, key));
  return 0;
}

/** Alamat IP klien dari header proxy (Vercel / reverse proxy); "lokal" bila tidak ada. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "lokal"
  );
}

/** Detik tunggu untuk `key` tanpa mencatat percobaan baru (0 = boleh). */
export async function rateLimitWait(key: string, max: number, windowSeconds: number, now = Date.now()): Promise<number> {
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  if (!row || now - row.lastRequest >= windowSeconds * 1000 || row.count < max) return 0;
  return Math.ceil((row.lastRequest + windowSeconds * 1000 - now) / 1000);
}

/** Hapus catatan percobaan (mis. setelah berhasil masuk). */
export async function clearRateLimit(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}
