#!/usr/bin/env bash
# Pasang / perbarui UangLapangan di VPS: ambil kode terbaru, pasang dependensi, periksa env,
# terapkan migrasi database, build, lalu (re)start lewat PM2. Dipakai untuk pemasangan pertama
# maupun setiap pembaruan. Aplikasi terganggu ±1–3 menit selama proses.
# Jalankan dari mana saja:  bash deploy/vps/perbarui.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -f .env.production ]; then
  echo "✗ File .env.production belum ada di $(pwd). Buat dulu (lihat docs/DEPLOY-VPS.md langkah 3)." >&2
  exit 1
fi
chmod 600 .env.production

echo "→ Mengambil kode terbaru"
git pull --ff-only

echo "→ Memasang dependensi"
npm ci

echo "→ Memeriksa env"
node --env-file=.env.production scripts/check-env.mjs

echo "→ Menerapkan migrasi database"
npx tsx --env-file=.env.production scripts/db-migrate.mts

echo "→ Build"
npm run build

echo "→ Menjalankan aplikasi (PM2)"
pm2 startOrReload deploy/vps/ecosystem.config.cjs --update-env
pm2 save

echo "✓ Selesai. Status: pm2 status uanglapangan · Log: pm2 logs uanglapangan"
