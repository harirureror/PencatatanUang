// Cookie sementara selama login Google (state anti-CSRF + PKCE verifier). httpOnly, hanya
// dikirim ke /api/drive, berlaku 10 menit.
export const DRIVE_OAUTH_COOKIE = "uanglapangan_drive_oauth";
export const DRIVE_OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const, // dikirim saat Google mengarahkan kembali (navigasi GET)
  secure: process.env.NODE_ENV === "production",
  path: "/api/drive",
  maxAge: 10 * 60,
};
