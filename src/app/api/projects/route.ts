import type { ProjectSummary } from "@/lib/types";
import { getCurrentUserId } from "@/server/current-user";
import { validateProjectInput } from "@/server/project-input";
import { createProject, getActiveProject, listProjectSummaries } from "@/server/projects";

const noStore = { "Cache-Control": "no-store" };
const STATUSES = ["aktif", "selesai", "arsip"] as const;

/**
 * GET /api/projects — semua proyek pengguna beserta saldonya. Urutan: proyek aktif, yang
 * berjalan, lalu terbaru menurut tanggal mulai.
 * Query opsional: ?status=aktif|selesai|arsip
 * 200 { data: { projects: ProjectSummary[], activeProjectId: string | null } } · 400 status salah
 */
export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status");
  if (status !== null && !STATUSES.includes(status as ProjectSummary["status"])) {
    return Response.json(
      { error: 'status harus "aktif", "selesai", atau "arsip".' },
      { status: 400, headers: noStore },
    );
  }
  try {
    const { projects, activeProjectId } = await listProjectSummaries(await getCurrentUserId());
    const data = {
      projects: status ? projects.filter((p) => p.status === status) : projects,
      activeProjectId,
    };
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/projects gagal:", error);
    return Response.json({ error: "Gagal memuat daftar proyek." }, { status: 500, headers: noStore });
  }
}

/**
 * POST /api/projects — tambah proyek baru (status "aktif").
 * Body JSON: { name, client?, budget, startDate: "YYYY-MM-DD", endDate?, makeActive? }
 * `makeActive` default: true bila pengguna belum punya proyek aktif.
 * 201 { data: { project, active: boolean } } · 400 body bukan JSON · 422 { fieldErrors }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON." }, { status: 400, headers: noStore });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Body harus berupa objek JSON." }, { status: 400, headers: noStore });
  }
  const raw = body as Record<string, unknown>;
  if (raw.makeActive !== undefined && typeof raw.makeActive !== "boolean") {
    return Response.json(
      { error: "Isian tidak valid.", fieldErrors: { makeActive: "makeActive harus true atau false." } },
      { status: 422, headers: noStore },
    );
  }

  const result = validateProjectInput(raw);
  if ("errors" in result) {
    return Response.json(
      { error: "Isian tidak valid.", fieldErrors: result.errors },
      { status: 422, headers: noStore },
    );
  }

  try {
    const userId = await getCurrentUserId();
    const makeActive =
      (raw.makeActive as boolean | undefined) ?? (await getActiveProject(userId)) === null;
    const project = await createProject(userId, result.data, { makeActive });
    return Response.json({ data: { project, active: makeActive } }, { status: 201, headers: noStore });
  } catch (error) {
    console.error("POST /api/projects gagal:", error);
    return Response.json({ error: "Gagal menyimpan proyek." }, { status: 500, headers: noStore });
  }
}
