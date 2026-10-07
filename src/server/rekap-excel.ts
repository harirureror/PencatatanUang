// Laporan Excel rekap proyek, mengikuti format laporan lapangan pengguna:
//   Sheet "Cashflow": Tanggal | Jam | Detail | Masuk | Keluar | Saldo | Bukti Nota | Keterangan
//     — tanggal digabung per hari, saldo berjalan (rumus), baris Jumlah; "Bukti Nota" berupa
//       hyperlink ke foto notanya di sheet Lampiran.
//   Sheet "Lampiran": "Lampiran Nota", foto nota 3 per baris dengan judul di atas tiap foto.
//   Sheet "Dashboard": ringkasan, pengeluaran per kategori & per hari (tabel + grafik Excel).
// Foto JPG/PNG disematkan; format yang tidak didukung xlsx (WEBP/HEIC/SVG) tetap diberi kotak
// berketerangan agar hyperlink tidak mengarah ke tempat kosong.
import ExcelJS from "exceljs";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, receipts, transactions } from "@/db/schema";
import type { Project } from "@/lib/types";
import { isStoredKey, readReceiptFile } from "@/server/receipt-storage";
import { aggregateRekapTotals } from "@/server/rekap";
import { addCharts, addInternalLinks, sheetPath, type BarChart, type InternalLink } from "@/server/xlsx-charts";
import { createZip, readZip } from "@/server/zip";
import { dailyStats, expenseByCategory, expenseByDay, type ExpenseItem } from "@/lib/expense-insights";

// ---- Data ---------------------------------------------------------------------------------

export type SheetPhoto = { id: string; fileName: string; mimeType: string; fileUrl: string };
export type SheetRow = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm WIB (waktu dicatat)
  detail: string;
  category: string;
  type: "income" | "expense";
  amount: number;
  noReceipt: boolean;
  photos: SheetPhoto[];
};
export type RekapSheetData = {
  project: Project;
  from: string;
  to: string;
  /** Saldo sebelum baris pertama (dana awal + catatan sebelum `from`). */
  opening: number;
  /** true bila rentang mulai dari awal proyek (baris pertama = "Dana awal proyek"). */
  fromProjectStart: boolean;
  rows: SheetRow[];
};

const timeWIB = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
});

/** Catatan & foto proyek milik pengguna dalam rentang (urut tanggal lalu waktu dicatat). */
export async function loadRekapSheetData(
  userId: string,
  project: Project,
  from: string,
  to: string,
): Promise<RekapSheetData> {
  const own = and(
    eq(transactions.userId, userId),
    eq(transactions.projectId, project.id),
    isNull(transactions.deletedAt),
  );
  const totals = await aggregateRekapTotals(userId, project, { start: from, end: to });

  const txs = await db
    .select({ tx: transactions, category: categories.name })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(own, gte(transactions.transactionDate, from), lte(transactions.transactionDate, to)))
    .orderBy(asc(transactions.transactionDate), asc(transactions.createdAt), asc(sql`${transactions}.rowid`));

  const photos = txs.length
    ? await db
        .select()
        .from(receipts)
        .where(and(inArray(receipts.transactionId, txs.map((t) => t.tx.id)), isNull(receipts.deletedAt)))
        .orderBy(asc(receipts.uploadedAt))
    : [];

  return {
    project,
    from,
    to,
    opening: totals.balanceAtStart,
    fromProjectStart: totals.budgetInPeriod,
    rows: txs.map(({ tx, category }) => ({
      id: tx.id,
      date: tx.transactionDate,
      time: timeWIB.format(new Date(tx.createdAt)),
      detail: tx.description || category,
      category,
      type: tx.type,
      amount: tx.amount,
      noReceipt: tx.noReceipt,
      photos: photos
        .filter((p) => p.transactionId === tx.id)
        .map((p) => ({ id: p.id, fileName: p.fileName, mimeType: p.mimeType, fileUrl: p.fileUrl })),
    })),
  };
}

// ---- Ukuran gambar (untuk menyesuaikan foto ke kotaknya) -----------------------------------

export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // SOF0–SOF15 kecuali DHT (C4), JPG (C8), DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

// ---- Workbook -----------------------------------------------------------------------------

const RUPIAH_SIGNED = '"+ Rp "#,##0;"- Rp "#,##0;"Rp "0';
const RUPIAH = '"Rp "#,##0;"- Rp "#,##0;"Rp "0';
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAE2D5" } };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFBFBFBF" } },
  bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
  left: { style: "thin", color: { argb: "FFBFBFBF" } },
  right: { style: "thin", color: { argb: "FFBFBFBF" } },
};
const LINK_FONT: Partial<ExcelJS.Font> = { color: { argb: "FF1155CC" }, underline: true };

/** "HH:mm" → pecahan hari (nilai waktu Excel), supaya bisa diurutkan & tanpa tanda "teks angka". */
const excelTime = (hhmm: string) => {
  const [h, m] = hhmm.split(/[.:]/).map(Number);
  return (h * 60 + m) / 1440;
};

/** Tanggal Excel tanpa geser zona waktu. */
const excelDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const tanggalPanjang = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string) => tanggalPanjang.format(excelDate(iso));

// Tata letak sheet Lampiran (mengikuti contoh): 3 kotak per baris, judul + 16 baris foto.
const BLOCK_COLS = 3;
const BLOCK_ROWS = 18; // 1 baris judul + 16 baris foto + 1 baris jeda
const FIRST_BLOCK_ROW = 4;
const PHOTO_ROWS = 16;
const LAMPIRAN_COL_WIDTH = 12.63; // karakter
const COL_PX = Math.round(LAMPIRAN_COL_WIDTH * 7 + 5); // lebar kolom ± piksel (Calibri 11)
const ROW_PX = 20; // tinggi baris bawaan 15pt
const EMU_PER_PX = 9525;
const BOX_W = 3 * COL_PX - 24;
const BOX_H = PHOTO_ROWS * ROW_PX - 12;

type PhotoBlock = { row: SheetRow; photo: SheetPhoto; index: number; total: number };

const col = (n: number) => String.fromCharCode(65 + n); // 0 → A

export type ReadPhoto = (photo: SheetPhoto) => Promise<Buffer | null>;

/** Foto dari penyimpanan server; null bila bukan unggahan (foto contoh) atau tidak ada. */
export const readStoredPhoto: ReadPhoto = async (photo) =>
  isStoredKey(photo.fileUrl) ? readReceiptFile(photo.fileUrl) : null;

export async function buildRekapWorkbook(data: RekapSheetData, readPhoto: ReadPhoto = readStoredPhoto): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UangLapangan";
  wb.created = new Date();

  const cash = wb.addWorksheet("Cashflow", { views: [{ state: "frozen", ySplit: 2 }] });
  const dash = wb.addWorksheet("Dashboard");
  const lamp = wb.addWorksheet("Lampiran");

  // --- Lampiran: tentukan posisi tiap foto dulu (dipakai hyperlink di Cashflow).
  const blocks: PhotoBlock[] = data.rows.flatMap((row) =>
    row.photos.map((photo, index) => ({ row, photo, index, total: row.photos.length })),
  );
  const blockCell = (i: number) => {
    const c = (i % BLOCK_COLS) * 3;
    const r = FIRST_BLOCK_ROW + Math.floor(i / BLOCK_COLS) * BLOCK_ROWS;
    // Tautan menunjuk area foto (di bawah judul), seperti contoh: Lampiran!D5:F20.
    return { c, r, ref: `${col(c)}${r + 1}:${col(c + 2)}${r + PHOTO_ROWS}` };
  };
  const firstBlockOf = new Map<string, string>();
  blocks.forEach((b, i) => {
    if (!firstBlockOf.has(b.row.id)) firstBlockOf.set(b.row.id, blockCell(i).ref);
  });

  // --- Cashflow
  cash.columns = [
    { key: "tanggal", width: 11 },
    { key: "jam", width: 8 },
    { key: "detail", width: 30 },
    { key: "masuk", width: 16 },
    { key: "keluar", width: 16 },
    { key: "saldo", width: 16 },
    { key: "bukti", width: 28 },
    { key: "ket", width: 22 },
  ];
  cash.mergeCells("A1:H1");
  const title = cash.getCell("A1");
  title.value = `Rekap Keuangan ${data.project.name} (${fmtDate(data.from)} – ${fmtDate(data.to)})`;
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  cash.getRow(1).height = 24;

  const header = cash.getRow(2);
  header.values = ["Tanggal", "Jam", "Detail", "Masuk", "Keluar", "Saldo", "Bukti Nota", "Keterangan"];
  header.eachCell((c) => {
    c.font = { bold: true };
    c.fill = HEADER_FILL;
    c.border = THIN;
    c.alignment = { horizontal: "center", vertical: "middle" };
  });

  const links: InternalLink[] = [];
  let r = 3;
  const budget = data.fromProjectStart ? data.project.budget : null;
  // Baris saldo awal supaya kolom Saldo sama dengan sisa dana di aplikasi.
  const opening = cash.getRow(r);
  opening.values = [
    excelDate(data.from),
    "",
    data.fromProjectStart ? "Dana awal proyek" : "Saldo awal periode",
    // Periode memuat tanggal mulai: dana awal = uang masuk (sama seperti di aplikasi).
    // Selain itu: saldo awal periode, hanya di kolom Saldo.
    budget,
    null,
    budget === null
      ? data.opening
      : { formula: data.opening === 0 ? `D${r}` : `${data.opening}+D${r}`, result: data.opening + budget },
    "",
    data.fromProjectStart ? "Dana yang disiapkan" : `Saldo s.d. ${fmtDate(data.from)}`,
  ];
  opening.font = { italic: true };
  let saldo = data.opening + (budget ?? 0);
  r++;

  for (const row of data.rows) {
    const masuk = row.type === "income" ? row.amount : null;
    const keluar = row.type === "expense" ? -row.amount : null;
    saldo += (masuk ?? 0) + (keluar ?? 0);
    const link = firstBlockOf.get(row.id);
    const buktiText =
      row.type === "income"
        ? ""
        : link
          ? `Nota ${row.detail}${row.photos.length > 1 ? ` (${row.photos.length} foto)` : ""}`
          : row.noReceipt
            ? "Tanpa struk"
            : "Belum ada nota";
    const line = cash.getRow(r);
    line.values = [
      excelDate(row.date),
      excelTime(row.time),
      row.detail,
      masuk,
      keluar,
      { formula: `F${r - 1}+D${r}+E${r}`, result: saldo },
      buktiText,
      row.category,
    ];
    if (link) {
      line.getCell(7).font = LINK_FONT;
      links.push({ ref: `G${r}`, location: `Lampiran!${link}`, display: buktiText });
    }
    else if (row.type === "expense") line.getCell(7).font = { color: { argb: "FFB45309" } };
    r++;
  }
  const lastData = r - 1;

  // Tanggal yang sama digabung (seperti contoh).
  let runStart = 3;
  for (let i = 4; i <= lastData + 1; i++) {
    const prev = cash.getCell(`A${i - 1}`).value as Date;
    const cur = i <= lastData ? (cash.getCell(`A${i}`).value as Date) : null;
    if (!cur || cur.getTime() !== prev.getTime()) {
      if (i - 1 > runStart) cash.mergeCells(`A${runStart}:A${i - 1}`);
      runStart = i;
    }
  }

  const total = cash.getRow(r);
  cash.mergeCells(`A${r}:C${r}`);
  total.getCell(1).value = "Jumlah";
  const sumOf = (type: SheetRow["type"]) => data.rows.filter((x) => x.type === type).reduce((n, x) => n + x.amount, 0);
  total.getCell(4).value = { formula: `SUM(D3:D${lastData})`, result: (budget ?? 0) + sumOf("income") };
  total.getCell(5).value = { formula: `SUM(E3:E${lastData})`, result: -sumOf("expense") };
  total.getCell(6).value = { formula: `F${lastData}`, result: saldo };
  total.font = { bold: true };

  for (let i = 3; i <= r; i++) {
    const row = cash.getRow(i);
    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.border = THIN;
      cell.alignment = { vertical: "middle", wrapText: c === 3 || c === 8, horizontal: c === 1 || c === 2 ? "center" : undefined };
    }
    row.getCell(1).numFmt = "d-mmm-yy";
    row.getCell(2).numFmt = "hh:mm";
    row.getCell(4).numFmt = RUPIAH_SIGNED;
    row.getCell(5).numFmt = RUPIAH_SIGNED;
    row.getCell(6).numFmt = RUPIAH;
  }
  total.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 1; c <= 8; c++) total.getCell(c).fill = HEADER_FILL;
  cash.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  // --- Lampiran
  lamp.columns = Array.from({ length: 9 }, () => ({ width: LAMPIRAN_COL_WIDTH }));
  lamp.getCell("A1").value = "Lampiran Nota";
  lamp.getCell("A1").font = { bold: true, size: 14 };
  lamp.getCell("A2").value = `${data.project.name} · ${fmtDate(data.from)} – ${fmtDate(data.to)}`;
  lamp.getCell("A2").font = { color: { argb: "FF666666" } };
  if (blocks.length === 0) lamp.getCell("A4").value = "Tidak ada foto nota dalam periode ini.";

  for (const [i, b] of blocks.entries()) {
    const { c, r: top } = blockCell(i);
    const left = col(c);
    const right = col(c + 2);
    lamp.mergeCells(`${left}${top}:${right}${top}`);
    const caption = lamp.getCell(`${left}${top}`);
    caption.value = `${fmtDate(b.row.date)} · ${b.row.detail}${b.total > 1 ? ` (${b.index + 1}/${b.total})` : ""}`;
    caption.font = { bold: true };
    caption.fill = HEADER_FILL;
    caption.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    caption.border = THIN;
    lamp.mergeCells(`${left}${top + 1}:${right}${top + PHOTO_ROWS}`);
    const area = lamp.getCell(`${left}${top + 1}`);
    area.border = THIN;

    const buf = await readPhoto(b.photo).catch(() => null);
    const ext = b.photo.mimeType === "image/png" ? "png" : b.photo.mimeType === "image/jpeg" ? "jpeg" : null;
    const size = buf && ext ? imageSize(buf) : null;
    if (buf && ext && size) {
      const scale = Math.min(BOX_W / size.width, BOX_H / size.height, 1);
      const w = Math.round(size.width * scale);
      const h = Math.round(size.height * scale);
      const imageId = wb.addImage({ buffer: buf as unknown as ExcelJS.Buffer, extension: ext });
      // Di tengah kotak. Offset ditulis langsung dalam EMU — kolom pecahan di exceljs
      // dikonversi dengan asumsi lebar yang keliru sehingga foto bergeser ke kiri.
      const dx = (BOX_W + 12 - w) / 2;
      const dy = (BOX_H + 12 - h) / 2;
      const tl = {
        nativeCol: c + Math.floor(dx / COL_PX),
        nativeColOff: Math.round((dx % COL_PX) * EMU_PER_PX),
        nativeRow: top + Math.floor(dy / ROW_PX),
        nativeRowOff: Math.round((dy % ROW_PX) * EMU_PER_PX),
      };
      lamp.addImage(imageId, { tl, ext: { width: w, height: h }, editAs: "oneCell" } as unknown as ExcelJS.ImageRange);
    } else {
      area.value = !buf
        ? "Foto tidak tersedia di server (foto contoh / sudah dihapus)."
        : `Foto berformat ${b.photo.mimeType.replace("image/", "").toUpperCase()} tidak bisa disematkan di Excel — lihat di aplikasi UangLapangan.`;
      area.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      area.font = { italic: true, color: { argb: "FF888888" } };
    }
  }
  lamp.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const charts = fillDashboard(dash, data, saldo);

  const files = readZip(Buffer.from(await wb.xlsx.writeBuffer()));
  addInternalLinks(files, sheetPath(files, "Cashflow"), links);
  addCharts(files, sheetPath(files, "Dashboard"), charts);
  return createZip([...files].map(([path, data]) => ({ path, data, compress: !path.startsWith("xl/media/") })));
}

// ---- Sheet Dashboard ----------------------------------------------------------------------

const CHART_COLOR = "1F7A55";
// Ringkas agar label & sumbu tidak bertumpuk: Rp2,8jt · Rp850rb. Label data menyembunyikan nol.
const CHART_MONEY = '[>=1000000]"Rp"0.0,,"jt";[>=1000]"Rp"0,"rb";"Rp"0';
const CHART_LABEL = '[>=1000000]"Rp"0.0,,"jt";[>=1000]"Rp"0,"rb";""';
const CARD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };

/** Nomor seri tanggal Excel (sistem 1900) dari YYYY-MM-DD. */
const excelSerial = (iso: string) => (excelDate(iso).getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;

/**
 * Ringkasan, tabel pengeluaran per kategori & per hari, beserta spesifikasi grafiknya
 * (grafik disisipkan setelah exceljs menulis file — lihat xlsx-charts.ts).
 */
function fillDashboard(ws: ExcelJS.Worksheet, data: RekapSheetData, endBalance: number): BarChart[] {
  ws.columns = [{ width: 26 }, { width: 17 }, { width: 10 }, { width: 17 }, ...Array.from({ length: 6 }, () => ({ width: 12 }))];
  ws.mergeCells("A1:J1");
  ws.getCell("A1").value = `Dashboard Pengeluaran — ${data.project.name}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:J2");
  ws.getCell("A2").value = `Periode ${fmtDate(data.from)} – ${fmtDate(data.to)}`;
  ws.getCell("A2").font = { color: { argb: "FF666666" } };

  const items: ExpenseItem[] = data.rows.map((r) => ({
    type: r.type,
    amount: r.amount,
    date: r.date,
    categoryKey: r.category,
    categoryName: r.category,
  }));
  const cats = expenseByCategory(items);
  const days = expenseByDay(items, data.from, data.to);
  const stats = dailyStats(days);
  const expenseCount = cats.reduce((n, c) => n + c.count, 0);

  // Kartu ringkasan: label (baris 4), nilai (baris 5), keterangan (baris 6); 2 kolom per kartu,
  // diletakkan di A–B, C–D, F–G, H–I (kolom E jadi jeda agar sejajar dengan grafik).
  const cards: { at: [number, number]; label: string; value: number; note: string }[] = [
    { at: [0, 1], label: "Total pengeluaran", value: stats.total, note: `${expenseCount} catatan` },
    {
      at: [2, 3],
      label: "Rata-rata per hari aktif",
      value: stats.averageActive,
      note: `${stats.activeDays} dari ${days.length} hari ada pengeluaran`,
    },
    {
      at: [5, 7],
      label: "Pengeluaran harian terbesar",
      value: stats.biggest?.total ?? 0,
      note: stats.biggest ? fmtDate(stats.biggest.date) : "-",
    },
    { at: [8, 9], label: "Sisa saldo akhir periode", value: endBalance, note: endBalance < 0 ? "Melebihi dana" : "" },
  ];
  for (const card of cards) {
    const [a, b] = card.at.map(col);
    const lines: [number, string | number, Partial<ExcelJS.Font>][] = [
      [4, card.label, { color: { argb: "FF666666" }, size: 9 }],
      [5, card.value, { bold: true, size: 14, color: { argb: card.value < 0 ? "FFB91C1C" : "FF111827" } }],
      [6, card.note, { color: { argb: "FF888888" }, size: 9 }],
    ];
    for (const [row, value, font] of lines) {
      ws.mergeCells(`${a}${row}:${b}${row}`);
      const cell = ws.getCell(`${a}${row}`);
      cell.value = value;
      cell.font = font;
      cell.fill = CARD_FILL;
      cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      if (row === 5) cell.numFmt = RUPIAH;
    }
  }
  ws.getRow(5).height = 22;

  const section = (row: number, title: string, headers: string[]) => {
    ws.mergeCells(`A${row}:D${row}`);
    const t = ws.getCell(`A${row}`);
    t.value = title;
    t.font = { bold: true, size: 12 };
    const h = ws.getRow(row + 1);
    headers.forEach((label, i) => {
      const cell = h.getCell(i + 1);
      cell.value = label;
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.border = THIN;
      cell.alignment = { horizontal: "center" };
    });
  };
  const styleRows = (from: number, to: number, formats: (string | undefined)[]) => {
    for (let r = from; r <= to; r++) {
      formats.forEach((f, i) => {
        const cell = ws.getRow(r).getCell(i + 1);
        cell.border = THIN;
        if (f) cell.numFmt = f;
      });
    }
  };

  // --- Pengeluaran per kategori (terbesar dulu)
  const CAT_TOP = 8;
  section(CAT_TOP, "Pengeluaran per Kategori", ["Kategori", "Jumlah", "Catatan", "Porsi"]);
  const catFirst = CAT_TOP + 2;
  if (cats.length === 0) {
    ws.getCell(`A${catFirst}`).value = "Belum ada pengeluaran pada periode ini.";
    ws.getCell(`A${catFirst}`).font = { italic: true, color: { argb: "FF888888" } };
    return [];
  }
  cats.forEach((c, i) => {
    ws.getRow(catFirst + i).values = [c.name, c.total, c.count, c.share];
  });
  const catLast = catFirst + cats.length - 1;
  const catTotal = ws.getRow(catLast + 1);
  catTotal.values = ["Jumlah", stats.total, expenseCount, 1];
  catTotal.font = { bold: true };
  styleRows(catFirst, catLast + 1, [undefined, RUPIAH, "0", "0%"]);
  for (let c = 1; c <= 4; c++) catTotal.getCell(c).fill = HEADER_FILL;
  const catChartRows = Math.max(16, Math.ceil(cats.length * 1.6) + 5);

  // --- Pengeluaran harian (setiap hari dalam periode, termasuk yang nol)
  const DAY_TOP = Math.max(catLast + 1, CAT_TOP - 1 + catChartRows) + 3;
  section(DAY_TOP, "Pengeluaran Harian", ["Tanggal", "Pengeluaran", "Catatan", "Kumulatif"]);
  const dayFirst = DAY_TOP + 2;
  let running = 0;
  days.forEach((d, i) => {
    running += d.total;
    const row = ws.getRow(dayFirst + i);
    row.values = [excelDate(d.date), d.total, d.count, running];
    if (d.total === 0) row.font = { color: { argb: "FF9CA3AF" } };
  });
  const dayLast = dayFirst + days.length - 1;
  const dayTotal = ws.getRow(dayLast + 1);
  dayTotal.values = ["Jumlah", stats.total, expenseCount, null];
  dayTotal.font = { bold: true };
  styleRows(dayFirst, dayLast + 1, ["d mmm yyyy", RUPIAH, "0", RUPIAH]);
  for (let c = 1; c <= 4; c++) dayTotal.getCell(c).fill = HEADER_FILL;
  ws.getCell(`A${dayLast + 1}`).numFmt = "General";

  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const ref = (c: string, a: number, b: number) => `'Dashboard'!$${c}$${a}:$${c}$${b}`;
  return [
    {
      direction: "bar",
      title: "Pengeluaran per Kategori",
      seriesName: "Pengeluaran",
      categoriesRef: ref("A", catFirst, catLast),
      valuesRef: ref("B", catFirst, catLast),
      categories: { kind: "text", values: cats.map((c) => c.name) },
      values: cats.map((c) => c.total),
      color: CHART_COLOR,
      valueFormat: CHART_MONEY,
      labelFormat: CHART_LABEL,
      dataLabels: true,
      from: { col: 5, row: CAT_TOP - 1 },
      to: { col: 10, row: CAT_TOP - 1 + catChartRows },
    },
    {
      direction: "col",
      title: "Pengeluaran Harian",
      seriesName: "Pengeluaran",
      categoriesRef: ref("A", dayFirst, dayLast),
      valuesRef: ref("B", dayFirst, dayLast),
      categories: { kind: "date", values: days.map((d) => excelSerial(d.date)), format: "d mmm" },
      values: days.map((d) => d.total),
      color: CHART_COLOR,
      valueFormat: CHART_MONEY,
      labelFormat: CHART_LABEL,
      dataLabels: days.length <= 14,
      from: { col: 5, row: DAY_TOP - 1 },
      to: { col: 10, row: DAY_TOP - 1 + 18 },
    },
  ];
}
