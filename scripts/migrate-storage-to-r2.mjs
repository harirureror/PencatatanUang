// Pindahkan berkas yang sudah ada di folder lokal ke Cloudflare R2 (sekali, saat beralih ke R2):
//   data/receipts/**  → receipts/**   (foto struk)
//   data/backups/**   → backups/**    (arsip backup sementara / mode simulasi)
// Berkas yang sudah ada di R2 dilewati; berkas lokal TIDAK dihapus.
// Jalankan:  node --env-file=.env.production scripts/migrate-storage-to-r2.mjs [--dry-run]
// Butuh env R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (opsional R2_ENDPOINT,
// STORAGE_DIR = folder lokal, bawaan ./data).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { r2FromEnv } from "./lib/r2.mjs";

const r2 = r2FromEnv();
if (!r2) {
  console.error("Isi dulu R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.");
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");
const root = path.resolve(process.env.STORAGE_DIR ?? "./data");
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", zip: "application/zip" };

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // folder belum ada
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

const stats = { uploaded: 0, skipped: 0, failed: 0 };

for (const prefix of ["receipts", "backups"]) {
  for await (const file of walk(path.join(root, prefix))) {
    const key = path.relative(root, file).split(path.sep).join("/");
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    if (dryRun) {
      console.log("akan diunggah:", key);
      continue;
    }
    try {
      if (await r2.put(key, await readFile(file), TYPES[ext])) stats.uploaded++;
      else stats.skipped++;
    } catch (error) {
      stats.failed++;
      console.error("gagal:", key, error instanceof Error ? error.message : String(error));
    }
  }
}
console.log(dryRun ? "Uji coba selesai (tidak ada yang diunggah)." : `Selesai: ${stats.uploaded} diunggah, ${stats.skipped} sudah ada, ${stats.failed} gagal.`);
process.exit(stats.failed > 0 ? 1 : 0);
