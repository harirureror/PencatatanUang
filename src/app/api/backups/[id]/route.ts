import { getArchive } from "@/server/backups";
import { getCurrentUserId } from "@/server/current-user";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/backups/:id — rincian satu arsip backup milik pengguna.
 * 200 { data: BackupArchive } · 404 tidak ditemukan / milik pengguna lain
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/backups/[id]">) {
  try {
    const { id } = await ctx.params;
    const data = await getArchive(await getCurrentUserId(), id);
    if (!data) {
      return Response.json({ error: "Arsip tidak ditemukan." }, { status: 404, headers: noStore });
    }
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/backups/[id] gagal:", error);
    return Response.json({ error: "Gagal memuat arsip." }, { status: 500, headers: noStore });
  }
}
