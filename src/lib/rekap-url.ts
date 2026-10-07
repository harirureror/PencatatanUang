// URL halaman Rekap: semua filter ada di query string supaya rekap bisa disimpan / dibagikan
// dan tombol kembali bekerja wajar.
//   /rekap?periode=harian|mingguan|rentang&tanggal=YYYY-MM-DD&dari=…&sampai=…&proyek=<id>
import { shiftISODate } from "@/lib/format";
import { daysBetween, MAX_RANGE_DAYS, type RekapPeriod, type RekapQuery } from "@/lib/rekap";

export type RekapLink = { period: RekapPeriod; date?: string; from?: string; to?: string; project?: string };

export function rekapHref({ period, date, from, to, project }: RekapLink): string {
  const q = new URLSearchParams({ periode: period });
  if (period === "rentang") {
    if (from) q.set("dari", from);
    if (to) q.set("sampai", to);
  } else if (date) {
    q.set("tanggal", date);
  }
  if (project) q.set("proyek", project);
  return `/rekap?${q.toString()}`;
}

const isISODate = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** Rentang bawaan saat tab Rentang dibuka: 30 hari terakhir. */
export const defaultRange = (today: string) => ({ from: shiftISODate(today, -29), to: today });

/** Periksa rentang bebas. Null bila valid, selain itu pesan untuk pengguna. */
export function rangeError(from: string, to: string, today: string): string | null {
  if (!isISODate(from) || !isISODate(to)) return "Tanggal tidak valid.";
  if (from > to) return "Tanggal awal harus sebelum tanggal akhir.";
  if (to > today) return "Tanggal akhir tidak boleh melewati hari ini.";
  if (daysBetween(from, to) > MAX_RANGE_DAYS) return `Rentang paling panjang ${MAX_RANGE_DAYS} hari.`;
  return null;
}

/**
 * Baca query string menjadi permintaan rekap yang valid. Nilai yang tidak valid diganti
 * bawaan (hari ini / 30 hari terakhir / proyek aktif); `notice` menjelaskan bila ada yang diganti.
 */
export function parseRekapParams(
  params: Record<string, string | string[] | undefined>,
  today: string,
  defaultProjectId: string,
  knownProjectIds: string[],
): { query: RekapQuery; notice: string | null } {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const period: RekapPeriod =
    get("periode") === "mingguan" ? "mingguan" : get("periode") === "rentang" ? "rentang" : "harian";

  let notice: string | null = null;
  const projectParam = get("proyek");
  const projectId = projectParam && knownProjectIds.includes(projectParam) ? projectParam : defaultProjectId;
  if (projectParam && projectId !== projectParam) notice = "Proyek tidak ditemukan — menampilkan proyek aktif.";

  const dateParam = get("tanggal");
  const date = isISODate(dateParam) && dateParam <= today ? dateParam : today;

  if (period !== "rentang") return { query: { projectId, period, date }, notice };

  const from = get("dari");
  const to = get("sampai");
  if (from === undefined && to === undefined) {
    return { query: { projectId, period, date, ...defaultRange(today) }, notice };
  }
  const error = rangeError(from ?? "", to ?? "", today);
  if (error) {
    return {
      query: { projectId, period, date, ...defaultRange(today) },
      notice: `${error} Menampilkan 30 hari terakhir.`,
    };
  }
  return { query: { projectId, period, date, from, to }, notice };
}
