// Kontrak data halaman Rekap Laporan (RekapQuery → RekapData) dan helper periode bersama.
// Dihitung di server oleh src/server/rekap.ts.
import { shiftISODate } from "@/lib/format";
import type { ProjectStatus, TransactionType } from "@/lib/types";

export type RekapPeriod = "harian" | "mingguan" | "rentang";

/** Batas panjang rentang bebas (hari) — rekap lebih panjang dipecah per tahun. */
export const MAX_RANGE_DAYS = 366;

export type RekapProject = {
  id: string;
  name: string;
  client: string | null;
  budget: number;
  startDate: string;
  endDate: string | null;
  status: ProjectStatus;
};

export type RekapTransaction = {
  id: string;
  transactionDate: string;
  type: TransactionType;
  categoryId: string;
  categoryName: string;
  amount: number;
  description: string;
  hasReceipt: boolean;
  noReceipt: boolean;
};

export type RekapQuery = {
  projectId: string;
  period: RekapPeriod;
  /** Tanggal acuan untuk harian/mingguan. */
  date: string;
  /** Rentang bebas (period = "rentang"). */
  from?: string;
  to?: string;
};

export type RekapData = {
  project: RekapProject;
  period: { kind: RekapPeriod; start: string; end: string };
  totalIncome: number;
  totalExpense: number;
  /** Pemasukan − pengeluaran dalam periode. */
  net: number;
  /** Sisa dana proyek di akhir periode (dana awal + semua masuk − semua keluar s.d. akhir periode). */
  balanceAtEnd: number;
  count: number;
  /** Kelengkapan bukti pengeluaran dalam periode. */
  receipts: { withPhoto: number; noReceipt: number; missing: number };
  /** Total per kategori dalam periode, terbesar dulu (pengeluaran lalu pemasukan). */
  byCategory: { categoryId: string; name: string; type: TransactionType; total: number; count: number }[];
  /** Setiap hari dalam periode (mingguan: 7 hari Senin–Minggu). */
  byDay: { date: string; income: number; expense: number; count: number }[];
  /** Catatan dalam periode, terbaru dulu. */
  transactions: RekapTransaction[];
  /** Senin–Minggu yang memuat tanggal acuan: jumlah catatan per hari (penanda pemilih tanggal). */
  week: { date: string; count: number }[];
  /** Total periode sebelumnya (kemarin / minggu lalu / rentang sepanjang ini sebelumnya). */
  previous: { start: string; end: string; totalIncome: number; totalExpense: number };
  /** Jumlah seluruh catatan proyek (semua periode) — 0 = proyek belum punya catatan. */
  projectCount: number;
  /** Tanggal catatan terdekat sebelum / sesudah periode (untuk ajakan saat periode kosong). */
  nearby: { before: string | null; after: string | null };
};

/** Senin–Minggu yang memuat `date` (YYYY-MM-DD). */
export function weekRange(date: string): { start: string; end: string } {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Minggu
  const start = shiftISODate(date, -((day + 6) % 7));
  return { start, end: shiftISODate(start, 6) };
}

/** Jumlah hari dari `start` sampai `end` (inklusif). */
export function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

export function periodRange(q: Pick<RekapQuery, "period" | "date" | "from" | "to">): { start: string; end: string } {
  if (q.period === "rentang" && q.from && q.to) return { start: q.from, end: q.to };
  return q.period === "mingguan" ? weekRange(q.date) : { start: q.date, end: q.date };
}
