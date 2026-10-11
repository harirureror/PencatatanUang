// Mode salinan: server ini hanya menampilkan salinan harian dari aplikasi utama (lihat
// docs/DEPLOY-VPS.md). Aktif bila env MIRROR_OF berisi alamat aplikasi utama. Semua perubahan
// data ditolak di proxy — apa pun yang ditulis di sini akan tertimpa penyalinan berikutnya.

/** Alamat aplikasi utama, atau null bila server ini bukan salinan. */
export function mirrorOf(): string | null {
  return process.env.MIRROR_OF?.trim().replace(/\/$/, "") || null;
}

export const MIRROR_MESSAGE = "Ini salinan cadangan — hanya untuk melihat. Catat di aplikasi utama.";

/**
 * Permintaan tulis yang tetap boleh di mode salinan: masuk/keluar (sesi milik server ini
 * sendiri) dan token sinkron (perangkat perlu menarik data untuk menampilkannya).
 */
const MIRROR_WRITABLE = ["/api/auth", "/api/akun/masuk", "/api/akun/keluar", "/api/akun/sesi", "/api/sync/token"] as const;

export function isMirrorWriteAllowed(pathname: string): boolean {
  return MIRROR_WRITABLE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
