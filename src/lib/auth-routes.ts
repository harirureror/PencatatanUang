// Halaman & API mana yang butuh masuk — dipakai proxy (server) dan pengawas sesi (browser).

/** Halaman untuk yang belum masuk; yang sudah masuk diarahkan ke dashboard / tujuan. */
export const GUEST_ONLY_PATHS = ["/masuk", "/daftar"] as const;

/** Halaman yang boleh dibuka tanpa masuk. */
export const PUBLIC_PATHS = [...GUEST_ONLY_PATHS, "/lupa-sandi", "/atur-ulang-sandi"] as const;

/**
 * API yang boleh dipanggil tanpa sesi: akun (daftar/masuk/lupa sandi), Better Auth, cron
 * (dijaga CRON_SECRET), dan sinkron (boleh pakai token sinkron perangkat, dicek di handler).
 */
export const PUBLIC_API_PATHS = ["/api/akun", "/api/auth", "/api/cron", "/api/sync/pull", "/api/sync/push"] as const;

const matches = (path: string, list: readonly string[]) =>
  list.some((p) => path === p || path.startsWith(`${p}/`));

export const isPublicPath = (path: string) => matches(path, PUBLIC_PATHS);
export const isGuestOnlyPath = (path: string) => matches(path, GUEST_ONLY_PATHS);
export const isPublicApiPath = (path: string) => matches(path, PUBLIC_API_PATHS);

/** URL halaman masuk yang kembali ke `path` setelah berhasil. */
export function signInHref(pathWithSearch: string): string {
  return pathWithSearch === "/" ? "/masuk" : `/masuk?next=${encodeURIComponent(pathWithSearch)}`;
}
