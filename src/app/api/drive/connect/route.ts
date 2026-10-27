import { NextResponse, type NextRequest } from "next/server";

import { DRIVE_OAUTH_COOKIE, DRIVE_OAUTH_COOKIE_OPTIONS } from "@/lib/drive-oauth-cookie";
import { buildAuthUrl, googleOAuthConfig, newAuthRequest, redirectUri } from "@/server/google-oauth";
import { publicOrigin, publicUrl } from "@/server/public-url";

/**
 * GET /api/drive/connect — mulai menghubungkan Google Drive: arahkan ke layar izin Google
 * (OAuth, PKCE). Kembali ke /api/drive/callback.
 */
export function GET(request: NextRequest) {
  const config = googleOAuthConfig();
  if (!config) {
    return NextResponse.redirect(publicUrl("/backup?drive=belum-dikonfigurasi", request));
  }
  const { state, verifier, challenge } = newAuthRequest();
  const redirect = redirectUri(publicOrigin(request));
  const response = NextResponse.redirect(buildAuthUrl(config, { state, challenge, redirect }));
  response.cookies.set(
    DRIVE_OAUTH_COOKIE,
    Buffer.from(JSON.stringify({ state, verifier })).toString("base64url"),
    DRIVE_OAUTH_COOKIE_OPTIONS,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
