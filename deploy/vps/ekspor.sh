#!/usr/bin/env bash
# Kemas seluruh data UangLapangan (database, foto struk, arsip backup) + file env menjadi satu
# berkas untuk dipindahkan ke VPS lain. Aplikasi dihentikan sebentar supaya salinannya utuh,
# lalu dijalankan lagi. Berkas hasil berisi DATA KEUANGAN dan KUNCI RAHASIA — jaga baik-baik.
# Pakai:  bash deploy/vps/ekspor.sh [berkas-tujuan.tar.gz]
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="${1:-$HOME/uanglapangan-pindah-$(date +%Y%m%d-%H%M).tar.gz}"
[ -f .env.production ] || { echo "✗ .env.production tidak ditemukan di $(pwd)." >&2; exit 1; }
[ -f data/uanglapangan.db ] || { echo "✗ data/uanglapangan.db tidak ditemukan di $(pwd)." >&2; exit 1; }

echo "→ Menghentikan aplikasi sebentar"
pm2 stop uanglapangan >/dev/null 2>&1 || true
trap 'pm2 start uanglapangan >/dev/null 2>&1 || true; echo "→ Aplikasi dijalankan lagi"' EXIT

echo "→ Mengemas data"
# Salinan harian database (data/salinan-db) tidak ikut: database utamanya sudah ada di dalam.
(umask 077; tar -czf "$OUT" --exclude='data/salinan-db' data .env.production)

echo "✓ Selesai: $OUT ($(du -h "$OUT" | cut -f1))"
echo "  Salin ke VPS baru, mis.:  scp \"$OUT\" root@<ip-vps-baru>:~/"
echo "  Lalu di VPS baru:         bash deploy/vps/impor.sh ~/$(basename "$OUT")"
