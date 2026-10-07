import { getCurrentUserId } from "@/server/current-user";
import {
  getActiveProjectWithSettings,
  ProjectArchivedError,
  ProjectNotFoundError,
  setActiveProject,
} from "@/server/projects";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/active-project — proyek aktif & ambang saldo menipis.
 * 200 { data: { project: Project | null, lowBalanceThreshold: number } }
 */
export async function GET() {
  try {
    const data = await getActiveProjectWithSettings(await getCurrentUserId());
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/active-project gagal:", error);
    return Response.json({ error: "Gagal memuat proyek aktif." }, { status: 500, headers: noStore });
  }
}

/**
 * PUT /api/active-project — ganti proyek aktif.
 * Body JSON: { projectId: string | null }  (null = kosongkan)
 * Catatan offline yang masih antre tetap masuk ke proyek tempat dicatat (lihat POST /api/transactions).
 * 200 { data: { project, lowBalanceThreshold } } · 400 body tidak valid · 404 proyek tidak ditemukan · 422 proyek diarsipkan
 */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON." }, { status: 400, headers: noStore });
  }
  const projectId = (body as { projectId?: unknown } | null)?.projectId;
  if (projectId !== null && (typeof projectId !== "string" || !projectId)) {
    return Response.json(
      { error: "projectId wajib diisi (string) atau null." },
      { status: 400, headers: noStore },
    );
  }

  try {
    const userId = await getCurrentUserId();
    const project = await setActiveProject(userId, projectId);
    const { lowBalanceThreshold } = await getActiveProjectWithSettings(userId);
    return Response.json({ data: { project, lowBalanceThreshold } }, { headers: noStore });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return Response.json({ error: error.message }, { status: 404, headers: noStore });
    }
    if (error instanceof ProjectArchivedError) {
      return Response.json({ error: error.message }, { status: 422, headers: noStore });
    }
    console.error("PUT /api/active-project gagal:", error);
    return Response.json({ error: "Gagal mengganti proyek aktif." }, { status: 500, headers: noStore });
  }
}
