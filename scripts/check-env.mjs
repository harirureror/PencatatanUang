// Periksa kelengkapan & kekuatan variabel lingkungan produksi. Hanya membaca process.env —
// muat file env Anda lewat Node:
//   node --env-file=.env.production scripts/check-env.mjs
// atau di Vercel (Build Command):  node scripts/check-env.mjs && next build
// Keluar dengan kode 1 bila ada yang WAJIB belum benar.

const env = process.env;
const errors = [];
const warnings = [];
const ok = [];

const minLength = (name, n) => {
  const v = env[name];
  if (!v) errors.push(`${name} belum diisi.`);
  else if (v.length < n) errors.push(`${name} terlalu pendek (minimal ${n} karakter acak) — buat dengan npm run env:secrets.`);
  else ok.push(name);
};
const required = (name, check, hint) => {
  const v = env[name];
  if (!v) errors.push(`${name} belum diisi.${hint ? ` ${hint}` : ""}`);
  else if (check && !check(v)) errors.push(`${name} tidak sesuai format.${hint ? ` ${hint}` : ""}`);
  else ok.push(name);
};
const isHttps = (v) => /^https:\/\/[^/]+/.test(v);

// Database
// Di VPS (disk permanen) DATABASE_URL boleh kosong: database berupa file di folder ./data.
if (!env.DATABASE_URL && !env.VERCEL) {
  warnings.push("DATABASE_URL kosong — database disimpan di file ./data/uanglapangan.db (hanya aman untuk VPS dengan disk permanen).");
} else {
  required("DATABASE_URL", (v) => /^(libsql|https|wss):\/\//.test(v), "Untuk Turso: libsql://<db>-<akun>.turso.io");
  if (env.DATABASE_URL?.startsWith("libsql://")) required("DATABASE_AUTH_TOKEN", null, "turso db tokens create <nama>");
}

// Akun, sinkron, cron
minLength("BETTER_AUTH_SECRET", 32);
required("BETTER_AUTH_URL", isHttps, "Harus https://… (alamat publik aplikasi, tanpa garis miring di akhir).");
minLength("SYNC_TOKEN_SECRET", 32);
minLength("CRON_SECRET", 16);

// Google Drive (backup) — boleh menyusul: tanpa ini aplikasi tetap jalan, backup belum bisa dipakai.
const googleKeys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"];
const googleFilled = googleKeys.filter((k) => env[k]);
if (googleFilled.length === 0) {
  warnings.push("GOOGLE_* kosong — backup ke Google Drive belum bisa dipakai (boleh diisi nanti, lalu Redeploy).");
} else {
  required("GOOGLE_CLIENT_ID", (v) => v.endsWith(".apps.googleusercontent.com"), "Dari Google Cloud Console (OAuth client Web).");
  required("GOOGLE_CLIENT_SECRET");
  required("GOOGLE_REDIRECT_URI", (v) => isHttps(v) && v.endsWith("/api/drive/callback"), "https://<domain>/api/drive/callback");
  if (env.BETTER_AUTH_URL && env.GOOGLE_REDIRECT_URI && !env.GOOGLE_REDIRECT_URI.startsWith(env.BETTER_AUTH_URL.replace(/\/$/, ""))) {
    warnings.push("GOOGLE_REDIRECT_URI tidak berada di domain BETTER_AUTH_URL — pastikan memang disengaja.");
  }
}
minLength("DRIVE_TOKEN_KEY", 32);

// Penyimpanan berkas (wajib di Vercel: disk tidak permanen)
const r2Keys = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const r2Filled = r2Keys.filter((k) => env[k]);
if (r2Filled.length === r2Keys.length) ok.push("R2 (penyimpanan berkas)");
else if (r2Filled.length > 0) errors.push(`Isi R2 belum lengkap — kurang: ${r2Keys.filter((k) => !env[k]).join(", ")}.`);
else if (env.VERCEL) errors.push("R2_* belum diisi — di Vercel foto struk akan HILANG tanpa penyimpanan R2.");
else warnings.push("R2_* kosong — berkas disimpan di folder server (hanya aman untuk VPS dengan disk permanen).");

// Salinan harian (opsional). MIRROR_OF: server INI adalah salinan hanya-lihat. MIRROR_*: server
// ini aplikasi utama yang menyalin datanya ke database & bucket lain (scripts/salin-data.mjs).
if (env.MIRROR_OF) {
  if (isHttps(env.MIRROR_OF)) ok.push("Mode salinan (hanya-lihat)");
  else errors.push("MIRROR_OF harus alamat https:// aplikasi utama.");
}
const mirrorKeys = ["MIRROR_DATABASE_URL", "MIRROR_R2_ACCOUNT_ID", "MIRROR_R2_ACCESS_KEY_ID", "MIRROR_R2_SECRET_ACCESS_KEY", "MIRROR_R2_BUCKET"];
const mirrorFilled = mirrorKeys.filter((k) => env[k]);
if (mirrorFilled.length === mirrorKeys.length) {
  if (env.MIRROR_DATABASE_URL.startsWith("libsql://") && !env.MIRROR_DATABASE_AUTH_TOKEN) errors.push("MIRROR_DATABASE_AUTH_TOKEN belum diisi.");
  else if (env.MIRROR_OF) errors.push("MIRROR_OF dan MIRROR_* tidak boleh diisi di server yang sama (salinan tidak menyalin ke tempat lain).");
  else ok.push("Penyalinan harian ke salinan");
} else if (mirrorFilled.length > 0) {
  errors.push(`Isi MIRROR_* belum lengkap — kurang: ${mirrorKeys.filter((k) => !env[k]).join(", ")}.`);
}

// Opsional tapi disarankan
if (env.RESEND_API_KEY && env.NOTIFY_EMAIL_FROM) ok.push("Email (Resend)");
else warnings.push("RESEND_API_KEY / NOTIFY_EMAIL_FROM kosong — tautan lupa sandi & pemberitahuan backup tidak terkirim lewat email.");
if (env.FONNTE_TOKEN) ok.push("WhatsApp (Fonnte)");
else warnings.push("FONNTE_TOKEN kosong — akun nomor HP tidak bisa menerima kode lupa sandi.");

console.log(`✓ Siap: ${ok.join(", ") || "-"}`);
for (const w of warnings) console.log(`! ${w}`);
for (const e of errors) console.log(`✗ ${e}`);
console.log(errors.length ? `\n${errors.length} masalah wajib harus diperbaiki.` : "\nEnv wajib lengkap.");
process.exit(errors.length ? 1 : 0);
