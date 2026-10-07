// Salin SQLite WASM (paket @sqlite.org/sqlite-wasm) ke public/sqlite-wasm agar dimuat apa
// adanya oleh worker DB lokal. Paket ini membuat Worker dari URL dinamis yang tidak bisa
// dibundel Turbopack, jadi tidak di-import lewat bundler. Dijalankan otomatis sebelum
// `npm run dev` dan `npm run build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/@sqlite.org/sqlite-wasm/dist");
const to = join(root, "public/sqlite-wasm");

mkdirSync(to, { recursive: true });
for (const file of ["index.mjs", "sqlite3.wasm", "sqlite3-opfs-async-proxy.js"]) {
  copyFileSync(join(from, file), join(to, file));
}
console.log("✓ SQLite WASM disalin ke public/sqlite-wasm");
