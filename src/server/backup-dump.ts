// Dump data satu pengguna dari hub menjadi arsip backup portabel (ZIP):
//   data.json       — semua data pengguna (proyek, kategori buatan, transaksi, lampiran, pengaturan)
//   struk/<id>.<ext> — foto struk yang tersimpan di server
//   manifest.json   — keterangan arsip + SHA-256 tiap file (diperiksa saat memulihkan)
//   BACA-SAYA.txt   — penjelasan isi arsip untuk manusia
// Kenapa JSON (bukan SQL): bisa dibaca alat apa pun (anti lock-in) dan pemulihannya bisa
// divalidasi baris per baris tanpa menjalankan SQL dari file. Kenapa ZIP: bisa dibuka bawaan
// Windows/Android/macOS. Isinya kondisi terkini — baris yang sudah dihapus tidak ikut.
import { createHash } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { categories, projects, receipts, settings, syncCounter, transactions } from "@/db/schema";
import { todayISO } from "@/lib/format";
import { readReceiptFile, isStoredKey } from "@/server/receipt-storage";
import { createZip, type ZipEntry } from "@/server/zip";

export const BACKUP_FORMAT = "uanglapangan-backup";
export const BACKUP_VERSION = 1;

export type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  userId: string;
  /** rev hub saat data diambil — titik waktu yang diwakili arsip. */
  sourceRev: number;
  tables: {
    projects: (typeof projects.$inferSelect)[];
    /** Kategori buatan pengguna (kategori bawaan sudah ada di setiap instalasi). */
    categories: (typeof categories.$inferSelect)[];
    transactions: (typeof transactions.$inferSelect)[];
    receipts: (typeof receipts.$inferSelect)[];
    settings: (typeof settings.$inferSelect)[];
  };
};

export type ManifestFile = { path: string; bytes: number; sha256: string };

export type BackupManifest = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  sourceRev: number;
  counts: { projects: number; categories: number; transactions: number; receipts: number; photos: number };
  files: ManifestFile[];
  /** Lampiran yang fotonya tidak ikut (mis. foto contoh, file hilang di server). */
  photosNotIncluded: { receiptId: string; reason: string }[];
};

export type UserDump = {
  fileName: string;
  /** Isi arsip (ZIP). */
  bytes: Buffer;
  /** SHA-256 isi arsip (hex). */
  checksum: string;
  sourceRev: number;
  projectCount: number;
  transactionCount: number;
  receiptCount: number;
};

export function backupFileName(date = todayISO()): string {
  return `uanglapangan-${date}.zip`;
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

const PHOTO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const README = `Arsip backup UangLapangan
=========================

Isi arsip ini:
- data.json      : semua data Anda (proyek, kategori buatan sendiri, transaksi, lampiran, pengaturan)
                   dalam format JSON — bisa dibuka dengan editor teks atau alat apa pun.
- struk/         : foto struk/nota. Nama file = id lampiran (lihat "receipts" di data.json).
- manifest.json  : keterangan arsip dan sidik jari (SHA-256) tiap file untuk memeriksa keutuhannya.

Memulihkan: buka UangLapangan → Sinkronisasi → Backup → pilih arsip → "Pulihkan dari arsip ini".
Jangan mengubah isi arsip bila ingin memulihkannya lewat aplikasi (arsip yang berubah ditolak).
`;

/** Ambil semua data milik pengguna (yang belum dihapus) lalu kemas menjadi arsip ZIP. */
export async function createUserDump(userId: string): Promise<UserDump> {
  // rev dibaca dulu: perubahan selama dump berlangsung punya rev lebih besar — arsip mewakili
  // paling tidak kondisi pada sourceRev.
  const [counter] = await db.select({ value: syncCounter.value }).from(syncCounter);
  const sourceRev = counter?.value ?? 0;

  const [p, c, t, r, s] = await Promise.all([
    db.select().from(projects).where(and(eq(projects.userId, userId), isNull(projects.deletedAt))),
    db.select().from(categories).where(and(eq(categories.userId, userId), isNull(categories.deletedAt))),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt))),
    db
      .select({ receipt: receipts })
      .from(receipts)
      .innerJoin(transactions, eq(transactions.id, receipts.transactionId))
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt), isNull(receipts.deletedAt))),
    db.select().from(settings).where(and(eq(settings.userId, userId), isNull(settings.deletedAt))),
  ]);

  const doc: BackupDocument = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    userId,
    sourceRev,
    tables: {
      projects: p,
      categories: c,
      transactions: t,
      receipts: r.map(({ receipt }) => receipt),
      settings: s,
    },
  };

  // Foto struk yang tersimpan di server ikut dikemas (tanpa dikompres ulang — sudah JPG/PNG/WEBP).
  const photos: ZipEntry[] = [];
  const photosNotIncluded: BackupManifest["photosNotIncluded"] = [];
  for (const receipt of doc.tables.receipts) {
    if (!isStoredKey(receipt.fileUrl)) {
      photosNotIncluded.push({ receiptId: receipt.id, reason: "foto contoh, bukan unggahan" });
      continue;
    }
    const data = await readReceiptFile(receipt.fileUrl);
    if (!data) {
      photosNotIncluded.push({ receiptId: receipt.id, reason: "file tidak ditemukan di server" });
      continue;
    }
    const ext = PHOTO_EXT[receipt.mimeType] ?? "bin";
    photos.push({ path: `struk/${receipt.id}.${ext}`, data, compress: false });
  }

  const content: ZipEntry[] = [{ path: "data.json", data: Buffer.from(JSON.stringify(doc, null, 1)) }, ...photos];
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: doc.createdAt,
    sourceRev,
    counts: {
      projects: p.length,
      categories: c.length,
      transactions: t.length,
      receipts: r.length,
      photos: photos.length,
    },
    files: content.map((e) => ({ path: e.path, bytes: e.data.length, sha256: sha256(e.data) })),
    photosNotIncluded,
  };

  const bytes = createZip([
    { path: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) },
    { path: "BACA-SAYA.txt", data: Buffer.from(README) },
    ...content,
  ]);
  return {
    fileName: backupFileName(),
    bytes,
    checksum: sha256(bytes),
    sourceRev,
    projectCount: p.length,
    transactionCount: t.length,
    receiptCount: r.length,
  };
}
