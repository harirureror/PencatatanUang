import { getSessionUser } from "@/server/session";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/akun/sesi — pengguna yang sedang masuk.
 * 200 { data: { user } } · 401 { data: { user: null } } belum masuk / sesi kedaluwarsa
 */
export async function GET(request: Request) {
  const user = await getSessionUser(request.headers);
  return Response.json({ data: { user } }, { status: user ? 200 : 401, headers: noStore });
}
