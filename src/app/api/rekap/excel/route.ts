import { todayISO } from "@/lib/format";
import { rangeError } from "@/lib/rekap-url";
import { getCurrentUserId } from "@/server/current-user";
import { getActiveProject, getProject } from "@/server/projects";
import { buildRekapWorkbook, loadRekapSheetData } from "@/server/rekap-excel";

const noStore = { "Cache-Control": "no-store" };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/rekap/excel?proyek=&dari=&sampai= — laporan Excel (.xlsx) rekap proyek: sheet
 * "Cashflow" (tanggal, jam, detail, masuk, keluar, saldo, bukti nota, keterangan) dengan
 * "Bukti Nota" ber-hyperlink ke foto notanya di sheet "Lampiran".
 * Bawaan: proyek aktif, dari tanggal mulai proyek s.d. hari ini.
 * 200 file xlsx · 400 rentang tidak valid · 404 proyek tidak ditemukan / milik pengguna lain
 */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const params = new URL(request.url).searchParams;
    const projectId = params.get("proyek");
    const project = projectId ? await getProject(userId, projectId) : await getActiveProject(userId);
    if (!project) {
      return Response.json({ error: "Proyek tidak ditemukan." }, { status: 404, headers: noStore });
    }

    const today = todayISO();
    const from = params.get("dari") ?? project.startDate;
    // Periode yang belum selesai (mis. minggu ini) dipotong sampai hari ini.
    const askedTo = params.get("sampai") ?? project.endDate ?? today;
    const to = askedTo > today ? today : askedTo;
    // Batas panjang rentang hanya untuk rentang pilihan; bawaan = seluruh proyek.
    const custom = params.has("dari") || params.has("sampai");
    const invalid = !ISO.test(from) || !ISO.test(to)
      ? "Format tanggal harus YYYY-MM-DD."
      : custom
        ? rangeError(from, to, today)
        : from > to
          ? "Proyek belum dimulai."
          : null;
    if (invalid) return Response.json({ error: invalid }, { status: 400, headers: noStore });

    const data = await loadRekapSheetData(userId, project, from, to);
    const file = await buildRekapWorkbook(data);
    // Header HTTP hanya boleh ASCII.
    const slug =
      project.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) ||
      "proyek";
    const name = `laporan-${slug}-${from}_${to}.xlsx`;
    return new Response(new Uint8Array(file), {
      headers: {
        ...noStore,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/rekap/excel gagal:", error);
    return Response.json({ error: "Gagal membuat laporan Excel." }, { status: 500, headers: noStore });
  }
}
