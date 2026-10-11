#!/usr/bin/env bash
# Pulihkan data + file env hasil ekspor.sh ke folder aplikasi ini (di VPS baru, setelah
# git clone). Menolak menimpa database yang sudah ada kecuali diberi --timpa; data lama
# dipindahkan ke data.lama-<waktu>, tidak dihapus.
# Pakai:  bash deploy/vps/impor.sh <berkas.tar.gz> [--timpa]
set -euo pipefail
cd "$(dirname "$0")/../.."

ARCHIVE="${1:-}"
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || { echo "✗ Pakai: bash deploy/vps/impor.sh <berkas.tar.gz> [--timpa]" >&2; exit 1; }
tar -tzf "$ARCHIVE" data/uanglapangan.db >/dev/null 2>&1 || { echo "✗ Berkas ini bukan hasil ekspor.sh (tidak ada data/uanglapangan.db)." >&2; exit 1; }

if [ -f data/uanglapangan.db ]; then
  if [ "${2:-}" != "--timpa" ]; then
    echo "✗ Sudah ada database di $(pwd)/data. Tambahkan --timpa bila memang ingin menggantinya" >&2
    echo "  (data lama dipindahkan ke data.lama-<waktu>, tidak dihapus)." >&2
    exit 1
  fi
  pm2 stop uanglapangan >/dev/null 2>&1 || true
  OLD="data.lama-$(date +%Y%m%d-%H%M%S)"
  mv data "$OLD"
  echo "→ Data lama dipindahkan ke $OLD"
fi

echo "→ Memulihkan data & env"
tar -xzf "$ARCHIVE"
chmod 600 .env.production

echo "✓ Selesai. Lanjutkan dengan:  bash deploy/vps/perbarui.sh"
