// Isi rekap untuk dibagikan / diekspor: teks ringkas (WhatsApp, email) dan CSV (Excel).
// Fungsi murni — dipakai tombol Bagikan / Unduh di halaman Rekap.
import { formatTanggal, formatTanggalPanjang } from "@/lib/format";
import { makeMoneyFormatter, type FormatMoney } from "@/lib/money";
import type { RekapData } from "@/lib/rekap";

const PERIOD_NAME = { harian: "harian", mingguan: "mingguan", rentang: "rentang tanggal" } as const;

export function rekapPeriodText(p: RekapData["period"]): string {
  if (p.kind === "harian") return formatTanggalPanjang(p.start);
  return p.start === p.end ? formatTanggal(p.start) : `${formatTanggal(p.start)} – ${formatTanggal(p.end)}`;
}


/**
 * Teks rekap untuk WhatsApp / email. *tebal* dipahami WhatsApp; di aplikasi lain tetap terbaca.
 */
/** Teks rekap untuk WhatsApp / email; nominal memakai format uang pengguna. */
export function buildRekapText(data: RekapData, formatRupiah: FormatMoney = makeMoneyFormatter()): string {
  const signed = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${formatRupiah(Math.abs(n))}`;
  const lines: string[] = [];
  lines.push(`*Rekap ${data.project.name}*`);
  if (data.project.client) lines.push(data.project.client);
  lines.push(`Periode: ${rekapPeriodText(data.period)} (${PERIOD_NAME[data.period.kind]})`);
  lines.push("");
  lines.push(`Uang masuk: ${formatRupiah(data.totalIncome)}`);
  lines.push(`Uang keluar: ${formatRupiah(data.totalExpense)}`);
  lines.push(`Selisih: ${signed(data.net)}`);
  lines.push(`Sisa dana proyek: ${data.balanceAtEnd < 0 ? "−" : ""}${formatRupiah(Math.abs(data.balanceAtEnd))}`);
  lines.push(`Jumlah catatan: ${data.count}`);

  const expenses = data.byCategory.filter((c) => c.type === "expense");
  if (expenses.length > 0) {
    lines.push("");
    lines.push("*Pengeluaran per kategori*");
    for (const c of expenses) {
      const share = data.totalExpense > 0 ? Math.round((c.total / data.totalExpense) * 100) : 0;
      lines.push(`• ${c.name}: ${formatRupiah(c.total)} (${share}%)`);
    }
  }

  // Harian: daftar catatan; lebih panjang: total per hari yang ada catatannya.
  if (data.period.kind === "harian" && data.transactions.length > 0) {
    lines.push("");
    lines.push("*Catatan*");
    for (const t of data.transactions) {
      const label = t.description || t.categoryName;
      lines.push(
        `• ${t.type === "income" ? "+" : "−"}${formatRupiah(t.amount)} ${label}${label === t.categoryName ? "" : ` (${t.categoryName})`}`,
      );
    }
  } else if (data.period.kind !== "harian") {
    const days = data.byDay.filter((d) => d.count > 0);
    if (days.length > 0) {
      lines.push("");
      lines.push("*Per hari*");
      for (const d of days) {
        const parts = [d.expense > 0 && `keluar ${formatRupiah(d.expense)}`, d.income > 0 && `masuk ${formatRupiah(d.income)}`].filter(Boolean);
        lines.push(`• ${formatTanggal(d.date)}: ${parts.join(", ")}`);
      }
    }
  }

  const { withPhoto, noReceipt, missing } = data.receipts;
  if (withPhoto + noReceipt + missing > 0) {
    lines.push("");
    const parts = [`${withPhoto} berfoto`, noReceipt > 0 && `${noReceipt} tanpa struk`, missing > 0 && `${missing} belum ada bukti`].filter(Boolean);
    lines.push(`Bukti pengeluaran: ${parts.join(", ")}`);
  }
  lines.push("");
  lines.push("— dibuat dengan UangLapangan");
  return lines.join("\n");
}

/** Satu sel CSV: dikutip bila perlu; diawali ' bila bisa dibaca Excel sebagai rumus. */
function cell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value === "string") s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV catatan dalam periode (terlama dulu), siap dibuka Excel / Google Sheets.
 * Nominal berupa angka bulat Rupiah (tanpa titik ribuan) agar bisa dijumlah.
 */
export function buildRekapCsv(data: RekapData): string {
  const header = ["Tanggal", "Jenis", "Kategori", "Keterangan", "Nominal (Rp)", "Bukti"];
  const rows = [...data.transactions]
    .reverse()
    .map((t) => [
      t.transactionDate,
      t.type === "income" ? "Pemasukan" : "Pengeluaran",
      t.categoryName,
      t.description,
      t.type === "income" ? t.amount : -t.amount,
      t.type === "income" ? "" : t.hasReceipt ? "Berfoto" : t.noReceipt ? "Tanpa struk" : "Belum ada",
    ]);
  // BOM agar Excel membaca UTF-8 (tanda "–", huruf khusus) dengan benar.
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Nama file: rekap-<proyek>-<awal>[_<akhir>].<ext> */
export function rekapFileName(data: RekapData, ext: string): string {
  const slug = data.project.name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const range = data.period.start === data.period.end ? data.period.start : `${data.period.start}_${data.period.end}`;
  return `rekap-${slug}-${range}.${ext}`;
}
