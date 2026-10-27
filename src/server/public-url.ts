// Alamat publik aplikasi untuk redirect dari route handler. Di VPS (di belakang Nginx /
// Cloudflare) request.url berisi alamat internal Next (mis. https://localhost:3100), jadi
// redirect harus memakai BETTER_AUTH_URL; tanpa env itu (dev) memakai alamat permintaan.

/** Origin publik, mis. "https://lapangan.jayasurvey.id". */
export function publicOrigin(request: Request): string {
  const configured = process.env.BETTER_AUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // format salah → pakai alamat permintaan
    }
  }
  return new URL(request.url).origin;
}

/** URL absolut di aplikasi ini untuk `path` ("/backup?drive=terhubung"). */
export function publicUrl(path: string, request: Request): URL {
  return new URL(path, publicOrigin(request));
}
