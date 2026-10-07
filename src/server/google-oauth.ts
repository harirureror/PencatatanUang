// OAuth 2.0 Google untuk menghubungkan Google Drive pengguna (Authorization Code + PKCE).
// Konfigurasi lewat env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   — dari Google Cloud Console (OAuth client "Web")
//   GOOGLE_REDIRECT_URI (opsional)           — default <origin>/api/drive/callback
// Izin hanya drive.file (file buatan aplikasi ini) + email untuk menampilkan akun yang terhubung.
import { createHash, randomBytes } from "node:crypto";

export const DRIVE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string;
};

/** Null bila OAuth Google belum dikonfigurasi di server. */
export function googleOAuthConfig(): OAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    // Bisa diganti untuk pengujian (server Google tiruan).
    authUrl: process.env.GOOGLE_OAUTH_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: process.env.GOOGLE_OAUTH_TOKEN_URL ?? "https://oauth2.googleapis.com/token",
    revokeUrl: process.env.GOOGLE_OAUTH_REVOKE_URL ?? "https://oauth2.googleapis.com/revoke",
  };
}

export function redirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/drive/callback`;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** state anti-CSRF + pasangan PKCE untuk satu kali login. */
export function newAuthRequest(): { state: string; verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return {
    state: b64url(randomBytes(24)),
    verifier,
    challenge: b64url(createHash("sha256").update(verifier).digest()),
  };
}

export function buildAuthUrl(
  config: OAuthConfig,
  { state, challenge, redirect }: { state: string; challenge: string; redirect: string },
): string {
  const url = new URL(config.authUrl);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: DRIVE_SCOPES.join(" "),
    access_type: "offline", // minta refresh token untuk backup terjadwal
    prompt: "consent", // pastikan refresh token selalu diberikan
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
  email: string | null;
};

/** Token ditolak Google (izin dicabut / kedaluwarsa) — pengguna perlu menghubungkan ulang. */
export class GoogleGrantRevokedError extends Error {}

async function tokenRequest(config: OAuthConfig, params: Record<string, string>) {
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (body.error === "invalid_grant") throw new GoogleGrantRevokedError(String(body.error_description ?? "invalid_grant"));
    throw new Error(`Google menolak permintaan token: ${String(body.error ?? res.status)}`);
  }
  return body;
}

/**
 * Email dari id_token. id_token ini diterima langsung dari endpoint token Google lewat HTTPS
 * (bukan dari browser), jadi isinya bisa dipercaya tanpa verifikasi tanda tangan.
 */
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

const expiresAt = (seconds: unknown) =>
  new Date(Date.now() + (typeof seconds === "number" ? seconds : 3600) * 1000).toISOString();

/** Tukar kode otorisasi (dari callback) menjadi token. */
export async function exchangeCode(
  config: OAuthConfig,
  { code, verifier, redirect }: { code: string; verifier: string; redirect: string },
): Promise<GoogleTokens> {
  const body = await tokenRequest(config, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: redirect,
  });
  if (typeof body.access_token !== "string") throw new Error("Google tidak mengirim access token.");
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
    expiresAt: expiresAt(body.expires_in),
    scope: typeof body.scope === "string" ? body.scope : "",
    email: emailFromIdToken(body.id_token),
  };
}

/** Access token baru dari refresh token (berlaku ±1 jam). */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const body = await tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken });
  if (typeof body.access_token !== "string") throw new Error("Google tidak mengirim access token.");
  return { accessToken: body.access_token, expiresAt: expiresAt(body.expires_in) };
}

/** Cabut izin di Google (dipanggil saat pengguna memutuskan Drive). Gagal diabaikan. */
export async function revokeToken(config: OAuthConfig, token: string): Promise<void> {
  await fetch(config.revokeUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => {});
}
