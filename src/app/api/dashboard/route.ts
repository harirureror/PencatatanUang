import { getCurrentUserId } from "@/server/current-user";
import { getDashboardSummary } from "@/server/dashboard";

/**
 * GET /api/dashboard — ringkasan saldo proyek aktif.
 * 200 { data: DashboardSummary }  |  200 { data: null } bila belum ada proyek aktif.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const data = await getDashboardSummary(userId);
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/dashboard gagal:", error);
    return Response.json(
      { error: "Gagal memuat ringkasan saldo." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
