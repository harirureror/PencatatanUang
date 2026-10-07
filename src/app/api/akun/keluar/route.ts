import { auth } from "@/server/auth";

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/akun/keluar — akhiri sesi di perangkat ini: baris sesi dihapus dari database dan
 * cookie sesi dikosongkan. Aman dipanggil walau sudah keluar.
 * 200 { data: { ok: true } }
 */
export async function POST(request: Request) {
  const out = new Headers(noStore);
  try {
    const { headers } = await auth.api.signOut({ headers: request.headers, returnHeaders: true });
    for (const cookie of headers.getSetCookie()) out.append("Set-Cookie", cookie);
  } catch {
    // Tidak ada sesi aktif — tetap anggap berhasil keluar.
  }
  return Response.json({ data: { ok: true } }, { headers: out });
}
