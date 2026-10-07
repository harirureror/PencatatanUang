// Koneksi Google Drive per pengguna: simpan / putuskan, status untuk halaman Backup, dan
// access token yang selalu segar untuk mengunggah arsip (diperbarui dari refresh token).
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { driveConnections } from "@/db/schema";
import {
  GoogleGrantRevokedError,
  googleOAuthConfig,
  refreshAccessToken,
  revokeToken,
  type GoogleTokens,
} from "@/server/google-oauth";
import { open, seal } from "@/server/secret-box";

export const DRIVE_FOLDER_NAME = "UangLapangan Backup";

export type DriveStatus = {
  connected: boolean;
  mode: "google" | "simulasi" | null;
  account: string | null;
  folder: string;
  /** Google menolak token — tampilkan ajakan menghubungkan ulang. */
  needsReconnect: boolean;
  /** OAuth Google sudah dikonfigurasi di server (tombol hubungkan memakai login Google). */
  oauthAvailable: boolean;
};

export async function getDriveStatus(userId: string): Promise<DriveStatus> {
  const [row] = await db.select().from(driveConnections).where(eq(driveConnections.userId, userId)).limit(1);
  const needsReconnect = row?.status === "perlu_dihubungkan";
  return {
    connected: !!row && !needsReconnect,
    mode: row?.mode ?? null,
    account: row?.accountEmail ?? null,
    folder: DRIVE_FOLDER_NAME,
    needsReconnect,
    oauthAvailable: googleOAuthConfig() !== null,
  };
}

/** Siap dipakai untuk backup (terhubung & tidak perlu dihubungkan ulang). */
export async function isDriveConnected(userId: string): Promise<boolean> {
  return (await getDriveStatus(userId)).connected;
}

/** Simpan hasil login Google (token dienkripsi sebelum disimpan). */
export async function saveGoogleConnection(userId: string, tokens: GoogleTokens): Promise<void> {
  if (!tokens.refreshToken) throw new Error("Google tidak memberi refresh token — ulangi menghubungkan.");
  const values = {
    mode: "google" as const,
    accountEmail: tokens.email ?? "akun Google",
    refreshTokenEnc: seal(tokens.refreshToken),
    accessTokenEnc: seal(tokens.accessToken),
    accessExpiresAt: tokens.expiresAt,
    scope: tokens.scope,
    status: "aktif" as const,
    error: null,
    connectedAt: new Date().toISOString(),
  };
  await db
    .insert(driveConnections)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: driveConnections.userId, set: values });
}

/** Mode pengembangan tanpa OAuth Google: koneksi tiruan agar alur backup bisa dicoba. */
export async function saveSimulatedConnection(userId: string): Promise<void> {
  const values = {
    mode: "simulasi" as const,
    accountEmail: "simulasi (tanpa Google)",
    refreshTokenEnc: null,
    accessTokenEnc: null,
    accessExpiresAt: null,
    status: "aktif" as const,
    error: null,
    connectedAt: new Date().toISOString(),
  };
  await db
    .insert(driveConnections)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: driveConnections.userId, set: values });
}

/** Putuskan Drive: izin dicabut di Google, token dihapus. Arsip yang ada di Drive tetap ada. */
export async function disconnectDrive(userId: string): Promise<void> {
  const [row] = await db.select().from(driveConnections).where(eq(driveConnections.userId, userId)).limit(1);
  const config = googleOAuthConfig();
  if (row?.mode === "google" && row.refreshTokenEnc && config) {
    try {
      await revokeToken(config, open(row.refreshTokenEnc));
    } catch {
      // Token tidak terbaca / sudah dicabut — tetap hapus dari database.
    }
  }
  await db.delete(driveConnections).where(eq(driveConnections.userId, userId));
}

/** Mode koneksi & folder backup (untuk layanan unggah). */
export async function getDriveTarget(
  userId: string,
): Promise<{ mode: "google" | "simulasi"; folderId: string | null } | null> {
  const [row] = await db
    .select({ mode: driveConnections.mode, folderId: driveConnections.folderId, status: driveConnections.status })
    .from(driveConnections)
    .where(eq(driveConnections.userId, userId))
    .limit(1);
  return row && row.status === "aktif" ? { mode: row.mode, folderId: row.folderId } : null;
}

export async function setDriveFolder(userId: string, folderId: string | null): Promise<void> {
  await db.update(driveConnections).set({ folderId }).where(eq(driveConnections.userId, userId));
}

/** Batas sisa umur access token sebelum diperbarui. */
const REFRESH_MARGIN_MS = 2 * 60_000;

export class DriveNotConnectedError extends Error {}

/**
 * Access token Google yang masih berlaku untuk pengguna. Diperbarui otomatis dari refresh
 * token; bila Google menolak (izin dicabut), koneksi ditandai "perlu dihubungkan ulang".
 */
export async function getDriveAccessToken(
  userId: string,
  /** true = abaikan token tersimpan (mis. Google baru saja menolaknya dengan 401). */
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<string> {
  const [row] = await db.select().from(driveConnections).where(eq(driveConnections.userId, userId)).limit(1);
  if (!row || row.mode !== "google" || row.status !== "aktif" || !row.refreshTokenEnc) {
    throw new DriveNotConnectedError("Google Drive belum terhubung.");
  }
  if (
    !forceRefresh &&
    row.accessTokenEnc &&
    row.accessExpiresAt &&
    Date.parse(row.accessExpiresAt) - Date.now() > REFRESH_MARGIN_MS
  ) {
    return open(row.accessTokenEnc);
  }
  const config = googleOAuthConfig();
  if (!config) throw new DriveNotConnectedError("OAuth Google belum dikonfigurasi di server.");
  try {
    const fresh = await refreshAccessToken(config, open(row.refreshTokenEnc));
    await db
      .update(driveConnections)
      .set({ accessTokenEnc: seal(fresh.accessToken), accessExpiresAt: fresh.expiresAt })
      .where(eq(driveConnections.userId, userId));
    return fresh.accessToken;
  } catch (error) {
    if (error instanceof GoogleGrantRevokedError) {
      await db
        .update(driveConnections)
        .set({
          status: "perlu_dihubungkan",
          error: "Izin Google Drive dicabut atau kedaluwarsa — hubungkan ulang.",
          accessTokenEnc: null,
        })
        .where(eq(driveConnections.userId, userId));
      throw new DriveNotConnectedError("Izin Google Drive dicabut atau kedaluwarsa — hubungkan ulang.");
    }
    throw error;
  }
}
