// Cetak nilai acak yang kuat untuk secret produksi. Hanya dicetak ke layar — salin ke Vercel
// (Environment Variables) atau .env produksi Anda. Tidak menulis file apa pun.
// Jalankan: npm run env:secrets
import { randomBytes } from "node:crypto";

const secrets = {
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
  SYNC_TOKEN_SECRET: randomBytes(48).toString("base64url"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  // AES-256-GCM: tepat 32 byte, base64.
  DRIVE_TOKEN_KEY: randomBytes(32).toString("base64"),
};

console.log("# Secret baru — simpan di tempat aman. Mengganti nilai ini nanti berarti:");
console.log("#  BETTER_AUTH_SECRET → semua pengguna harus masuk ulang");
console.log("#  DRIVE_TOKEN_KEY    → koneksi Google Drive harus dihubungkan ulang\n");
for (const [k, v] of Object.entries(secrets)) console.log(`${k}=${v}`);
