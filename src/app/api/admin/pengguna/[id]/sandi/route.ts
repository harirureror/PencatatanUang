import { adminSetPassword, isAdmin } from "@/server/admin";
import { getSessionUser } from "@/server/session";

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/admin/pengguna/:id/sandi — admin (env ADMIN_ACCOUNTS) mengatur sandi baru akun lain
 * tanpa verifikasi email / nomor HP. Semua sesi akun itu dicabut.
 * Body JSON: { password, confirm }
 * 200 { data: { signedOut } } · 400 body bukan JSON · 401 belum masuk · 403 bukan admin / akun sendiri
 * 404 akun tidak ada · 422 { fieldErrors }
 */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/pengguna/[id]/sandi">) {
  const admin = await getSessionUser(request.headers);
  if (!admin) return Response.json({ error: "Sesi berakhir — silakan masuk lagi." }, { status: 401, headers: noStore });
  if (!isAdmin(admin)) return Response.json({ error: "Hanya admin yang boleh." }, { status: 403, headers: noStore });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400, headers: noStore });
  }
  try {
    const result = await adminSetPassword(admin, (await ctx.params).id, body);
    if (result.ok) return Response.json({ data: { signedOut: result.signedOut } }, { headers: noStore });
    const { status, error, fieldErrors } = result;
    return Response.json({ error, fieldErrors }, { status, headers: noStore });
  } catch (error) {
    console.error("POST /api/admin/pengguna/:id/sandi gagal:", error);
    return Response.json({ error: "Gagal menyimpan sandi baru. Coba lagi." }, { status: 500, headers: noStore });
  }
}
