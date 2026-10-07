import { getCurrentUserId } from "@/server/current-user";
import { dismissNotification } from "@/server/notifications";

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/notifications/:id/dismiss — tutup pemberitahuan (muncul lagi bila kejadiannya
 * berulang). 200 { data: { id } } · 404 tidak ditemukan
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/notifications/[id]/dismiss">) {
  try {
    const { id } = await ctx.params;
    if (!(await dismissNotification(await getCurrentUserId(), id))) {
      return Response.json({ error: "Pemberitahuan tidak ditemukan." }, { status: 404, headers: noStore });
    }
    return Response.json({ data: { id } }, { headers: noStore });
  } catch (error) {
    console.error("POST /api/notifications/[id]/dismiss gagal:", error);
    return Response.json({ error: "Gagal menutup pemberitahuan." }, { status: 500, headers: noStore });
  }
}
