import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { DRIVE_OAUTH_COOKIE, DRIVE_OAUTH_COOKIE_OPTIONS } from "@/lib/drive-oauth-cookie";
import { getCurrentUserId } from "@/server/current-user";
import { saveGoogleConnection } from "@/server/drive-connections";
import { exchangeCode, googleOAuthConfig, redirectUri } from "@/server/google-oauth";

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * GET /api/drive/callback — Google mengarahkan kembali ke sini setelah pengguna memberi
 * (atau menolak) izin. state dicocokkan dengan cookie (anti-CSRF), kode ditukar menjadi token
 * (dengan PKCE verifier), token disimpan terenkripsi. Selalu kembali ke /backup?drive=<hasil>.
 */
export async function GET(request: NextRequest) {
  const done = (result: string) => {
    const response = NextResponse.redirect(new URL(`/backup?drive=${result}`, request.url));
    response.cookies.set(DRIVE_OAUTH_COOKIE, "", { ...DRIVE_OAUTH_COOKIE_OPTIONS, maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  };

  const config = googleOAuthConfig();
  if (!config) return done("belum-dikonfigurasi");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return done(params.get("error") === "access_denied" ? "ditolak" : "gagal");

  let saved: { state?: unknown; verifier?: unknown } = {};
  try {
    saved = JSON.parse(Buffer.from(request.cookies.get(DRIVE_OAUTH_COOKIE)?.value ?? "", "base64url").toString("utf8"));
  } catch {
    // cookie hilang / rusak → dianggap tidak sah
  }
  const state = params.get("state") ?? "";
  const code = params.get("code");
  if (typeof saved.state !== "string" || typeof saved.verifier !== "string" || !code || !sameString(state, saved.state)) {
    return done("tidak-sah");
  }

  try {
    const tokens = await exchangeCode(config, {
      code,
      verifier: saved.verifier,
      redirect: redirectUri(request.nextUrl.origin),
    });
    await saveGoogleConnection(await getCurrentUserId(), tokens);
    return done("terhubung");
  } catch (error) {
    console.error("Menghubungkan Google Drive gagal:", error);
    return done("gagal");
  }
}
