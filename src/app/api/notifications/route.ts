import { getCurrentUserId } from "@/server/current-user";
import { listOpenNotifications } from "@/server/notifications";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/notifications — pemberitahuan yang masih perlu dilihat pengguna (mis. backup
 * gagal), terbaru dulu. 200 { data: AppNotification[] }
 */
export async function GET() {
  try {
    const data = await listOpenNotifications(await getCurrentUserId());
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/notifications gagal:", error);
    return Response.json({ error: "Gagal memuat pemberitahuan." }, { status: 500, headers: noStore });
  }
}
