import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import { isGuestOnlyPath, isPublicApiPath, isPublicPath, signInHref } from "@/lib/auth-routes";
import { safeNextPath } from "@/lib/auth-rules";
import { isMirrorWriteAllowed, MIRROR_MESSAGE, mirrorOf } from "@/lib/mirror";
import { auth } from "@/server/auth";
import { USER_ID_HEADER } from "@/server/current-user";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Gerbang data per pemilik akun. Untuk setiap halaman & API:
 * 1. Header id pengguna dari luar selalu dibuang (tidak bisa dipalsukan).
 * 2. Sesi Better Auth diverifikasi (cookie bertanda tangan + baris `sessions` di database).
 * 3. Sah → id pengguna diteruskan ke server lewat header internal; getCurrentUserId() membacanya
 *    dan semua query menyaring data dengan id itu.
 * 4. Tidak sah → halaman diarahkan ke /masuk?next=…, API dijawab 401.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const forwarded = new Headers(request.headers);
  forwarded.delete(USER_ID_HEADER);

  // Mode salinan: tolak semua perubahan data (API maupun server action di halaman).
  if (mirrorOf() && !READ_METHODS.has(request.method) && !isMirrorWriteAllowed(pathname)) {
    return NextResponse.json(
      { error: MIRROR_MESSAGE, code: "mirror" },
      { status: 423, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Tanpa cookie sesi sama sekali tidak perlu bertanya ke database.
  const session = getSessionCookie(request) ? await auth.api.getSession({ headers: request.headers }).catch(() => null) : null;
  if (session) forwarded.set(USER_ID_HEADER, session.user.id);
  const next = () => NextResponse.next({ request: { headers: forwarded } });

  if (pathname.startsWith("/api/")) {
    if (session || isPublicApiPath(pathname)) return next();
    return NextResponse.json(
      { error: "Sesi berakhir — silakan masuk lagi.", code: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!session && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL(signInHref(pathname + search), request.url));
  }
  if (session && isGuestOnlyPath(pathname)) {
    return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url));
  }
  return next();
}

export const config = {
  // Semua halaman & API, kecuali aset Next, berkas statis (sqlite-wasm, foto contoh, ikon)
  // dan path berekstensi.
  matcher: ["/((?!_next/|sqlite-wasm/|contoh-struk/|.*\\.[a-zA-Z0-9]+$).*)"],
};
