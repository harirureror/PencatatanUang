// Tugas terjadwal UangLapangan di VPS (pengganti Vercel Cron) — dijalankan cron tiap jam:
//   node --env-file=.env.production deploy/vps/tugas-terjadwal.mjs
// 1) Memanggil /api/cron/backup: backup terjadwal ke Google Drive pengguna yang jatuh tempo
//    (aman dipanggil berulang — yang sudah dibackup dilewati).
// 2) Sekali sehari menyalin database ke data/salinan-db/ (7 hari terakhir disimpan), sebagai
//    cadangan lapis kedua di server.
// 3) Sekali sehari, bila MIRROR_DATABASE_URL diisi, menyalin seluruh data ke salinan yang
//    dibuka lewat Vercel (scripts/salin-data.mjs).
import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

const KEEP_DAYS = 7;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.chdir(root);

const log = (message) => console.log(`${new Date().toISOString()} ${message}`);
let failed = false;

async function callBackupCron() {
  const port = process.env.UANGLAPANGAN_PORT || "3100";
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET belum diisi di .env.production");
  const response = await fetch(`http://127.0.0.1:${port}/api/cron/backup`, {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const body = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${body}`);
  log(`backup terjadwal: ${body}`);
}

async function snapshotDatabase() {
  const url = process.env.DATABASE_URL || "file:./data/uanglapangan.db";
  if (!url.startsWith("file:")) return; // database remote (Turso) punya cadangan sendiri
  const source = path.resolve(url.slice("file:".length));
  if (!existsSync(source)) throw new Error(`database tidak ditemukan: ${source}`);

  const dir = path.join(path.dirname(source), "salinan-db");
  await mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const target = path.join(dir, `uanglapangan-${today}.db`);
  if (!existsSync(target)) {
    // VACUUM INTO menghasilkan salinan utuh walau aplikasi sedang menulis.
    const client = createClient({ url });
    try {
      await client.execute({ sql: "VACUUM INTO ?", args: [target] });
    } finally {
      client.close();
    }
    log(`salinan database dibuat: ${path.relative(root, target)}`);
  }

  const copies = (await readdir(dir)).filter((name) => /^uanglapangan-\d{4}-\d{2}-\d{2}\.db$/.test(name)).sort();
  for (const old of copies.slice(0, Math.max(0, copies.length - KEEP_DAYS))) {
    await rm(path.join(dir, old));
    log(`salinan lama dihapus: ${old}`);
  }
}

/** Sekali sehari: salin data ke salinan (Turso + R2 yang dibuka lewat Vercel), bila diatur. */
async function copyToMirror() {
  if (!process.env.MIRROR_DATABASE_URL) return;
  const { salin, terakhirDisalin } = await import("../../scripts/salin-data.mjs");
  const today = new Date().toISOString().slice(0, 10);
  if ((await terakhirDisalin())?.slice(0, 10) === today) return;
  await salin({ log });
}

const tasks = [
  ["backup terjadwal", callBackupCron],
  ["salinan database", snapshotDatabase],
  ["salinan ke Vercel", copyToMirror],
];
for (const [name, task] of tasks) {
  try {
    await task();
  } catch (error) {
    failed = true;
    log(`✗ ${name} gagal: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exit(failed ? 1 : 0);
