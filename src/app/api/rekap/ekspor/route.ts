import { todayISO } from "@/lib/format";
import type { RekapPeriod, RekapQuery } from "@/lib/rekap";
import { buildRekapCsv, buildRekapText, rekapFileName } from "@/lib/rekap-export";
import { rangeError } from "@/lib/rekap-url";
import { getCurrentUserId } from "@/server/current-user";
import { getActiveProject, getProject } from "@/server/projects";
import { buildRekapWorkbook, loadRekapSheetData } from "@/server/rekap-excel";
import { getMoneyFormatter } from "@/server/money";
import { getRekap } from "@/server/rekap";
import { isRealDate, noStore } from "@/server/rekap-request";

const FORMATS = ["teks", "csv", "xlsx"] as const;
const PERIODS: RekapPeriod[] = ["harian", "mingguan", "rentang"];

const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: noStore });

/**
 * GET /api/rekap/ekspor?format=teks|csv|xlsx&periode=harian|mingguan|rentang&tanggal=&dari=&sampai=&proyek=
 * Ekspor rekap dalam bentuk siap kirim, dengan parameter yang sama seperti halaman Rekap:
 *   - teks : ringkasan untuk WhatsApp / email (text/plain)
 *   - csv  : rincian catatan untuk spreadsheet (UTF-8 BOM, aman dari CSV injection)
 *   - xlsx : laporan Excel (Cashflow + Dashboard + Lampiran foto nota ber-hyperlink)
 * Bawaan: format teks, periode harian, hari ini, proyek aktif. Periode "rentang" tanpa
 * dari/sampai = seluruh proyek s.d. hari ini.
 * 200 file / teks · 400 parameter tidak valid · 404 proyek tidak ditemukan / milik pengguna lain
 */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const params = new URL(request.url).searchParams;
    const today = todayISO();

    const format = (params.get("format") ?? "teks") as (typeof FORMATS)[number];
    if (!FORMATS.includes(format)) return bad('format harus "teks", "csv", atau "xlsx".');
    const period = (params.get("periode") ?? "harian") as RekapPeriod;
    if (!PERIODS.includes(period)) return bad('periode harus "harian", "mingguan", atau "rentang".');

    const projectId = params.get("proyek");
    const project = projectId ? await getProject(userId, projectId) : await getActiveProject(userId);
    if (!project) return bad("Proyek tidak ditemukan.", 404);

    const query: RekapQuery = { projectId: project.id, period, date: params.get("tanggal") ?? today };
    if (period === "rentang") {
      const projectEnd = project.endDate && project.endDate < today ? project.endDate : today;
      query.from = params.get("dari") ?? project.startDate;
      query.to = params.get("sampai") ?? projectEnd;
      if (!isRealDate(query.from) || !isRealDate(query.to)) return bad("Tanggal harus berformat YYYY-MM-DD.");
      const custom = params.has("dari") || params.has("sampai");
      const invalid = custom ? rangeError(query.from, query.to, today) : query.from > query.to ? "Proyek belum dimulai." : null;
      if (invalid) return bad(invalid);
      query.date = query.to;
    } else {
      if (!isRealDate(query.date)) return bad("Tanggal harus berformat YYYY-MM-DD.");
      if (query.date > today) return bad("Tanggal tidak boleh melewati hari ini.");
    }

    const data = await getRekap(userId, query);
    if (!data) return bad("Proyek tidak ditemukan.", 404);

    if (format === "teks") {
      return new Response(buildRekapText(data, await getMoneyFormatter()), {
        headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (format === "csv") {
      return new Response(buildRekapCsv(data), {
        headers: {
          ...noStore,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${rekapFileName(data, "csv")}"`,
        },
      });
    }
    // Minggu yang belum selesai dipotong sampai hari ini (tidak ada catatan di masa depan).
    const to = data.period.end > today ? today : data.period.end;
    const sheet = await loadRekapSheetData(userId, project, data.period.start, to);
    return new Response(new Uint8Array(await buildRekapWorkbook(sheet)), {
      headers: {
        ...noStore,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${rekapFileName({ ...data, period: { ...data.period, end: to } }, "xlsx")}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/rekap/ekspor gagal:", error);
    return bad("Gagal membuat ekspor rekap.", 500);
  }
}
