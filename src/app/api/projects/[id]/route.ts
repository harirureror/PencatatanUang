import { getCurrentUserId } from "@/server/current-user";
import { getProjectDetail } from "@/server/projects";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/projects/:id — detail satu proyek dengan agregasi saldo: dana awal, pemasukan,
 * pengeluaran, saldo, total per kategori, kelengkapan bukti, dan rentang tanggal.
 * 200 { data: ProjectDetail } · 404 tidak ditemukan / milik pengguna lain
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const { id } = await ctx.params;
    const data = await getProjectDetail(await getCurrentUserId(), id);
    if (!data) {
      return Response.json({ error: "Proyek tidak ditemukan." }, { status: 404, headers: noStore });
    }
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/projects/[id] gagal:", error);
    return Response.json({ error: "Gagal memuat detail proyek." }, { status: 500, headers: noStore });
  }
}
