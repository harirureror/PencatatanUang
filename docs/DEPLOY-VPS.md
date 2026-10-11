# Deploy UangLapangan ke VPS sendiri (Nginx + PM2)

Untuk VPS Linux dengan akses root yang sudah punya **Nginx**, **PM2**, dan **Node.js 20+** —
misalnya VPS yang sudah menjalankan aplikasi lain. UangLapangan dipasang berdampingan: port
sendiri (`3100`), blok Nginx sendiri, proses PM2 sendiri. Aplikasi lain di server tidak diubah.

Di VPS, database dan foto struk disimpan di folder `data/` pada disk server. **Turso dan
Cloudflare R2 tidak dipakai.**

| Yang dibutuhkan | Keterangan |
|---|---|
| Subdomain | mis. `kas.domainanda.com`, diarahkan ke IP VPS. Wajib: login & kamera butuh HTTPS |
| RAM kosong ±1,5 GB saat build | ±500 MB saat berjalan |
| Google Drive (backup) | Sangat disarankan: semua data ada di satu disk — lihat [DEPLOY.md](DEPLOY.md) langkah 3 |
| Resend / Fonnte | Opsional, untuk lupa sandi — lihat [DEPLOY.md](DEPLOY.md) langkah 4–5 |

Semua perintah dijalankan di VPS lewat SSH sebagai root. Di setiap sesi SSH baru, isi dulu
subdomain Anda sekali (ganti dengan subdomain yang sebenarnya), supaya perintah di bawah bisa
disalin apa adanya:

```bash
DOMAIN=kas.domainanda.com
```

---

## 1. Arahkan subdomain ke VPS

Di pengelola DNS domain Anda (Hostinger: **hPanel → Domains → DNS / Nameservers**), tambahkan:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `kas` | alamat IP VPS | 300 |

Cek dari VPS (hasilnya harus IP VPS; bisa perlu beberapa menit):

```bash
getent hosts $DOMAIN
```

## 2. Ambil kode

```bash
git clone https://github.com/harirureror/PencatatanUang.git /opt/uanglapangan
cd /opt/uanglapangan
```

## 3. Buat file env

Perintah ini membuat keempat kunci rahasia langsung ke dalam file — tidak perlu disalin tangan,
dan tidak tampil di layar:

```bash
cd /opt/uanglapangan
node scripts/generate-secrets.mjs > .env.production
echo "BETTER_AUTH_URL=https://$DOMAIN" >> .env.production
chmod 600 .env.production
```

Jangan isi `DATABASE_URL` maupun `R2_*` — dikosongkan berarti memakai folder `data/`.
Layanan opsional (Google Drive, Resend, Fonnte) ditambahkan ke file yang sama kapan saja, satu
baris per variabel seperti di [`.env.example`](../.env.example) (`nano .env.production`), lalu
jalankan lagi langkah 4.

> File ini berisi kunci rahasia. Jangan ditempel ke chat, email, atau repo.

## 4. Pasang & jalankan

```bash
bash deploy/vps/perbarui.sh
npx tsx --env-file=.env.production src/db/seed.ts --hanya-kategori
```

Baris pertama memasang dependensi, memeriksa env, membuat database, build, lalu menjalankan
aplikasi lewat PM2 (±3–5 menit). Baris kedua mengisi kategori bawaan — cukup sekali.

Cek aplikasi hidup (harus `200`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/masuk
```

Agar hidup lagi otomatis setelah server reboot: `pm2 save` sudah dijalankan skrip. Bila PM2 di
server ini belum pernah diatur menyala saat boot, jalankan sekali `pm2 startup` dan ikuti
perintah yang dicetaknya.

## 5. Nginx

```bash
sed "s/kas.domainanda.com/$DOMAIN/" deploy/vps/nginx.conf > /etc/nginx/sites-available/uanglapangan
ln -s /etc/nginx/sites-available/uanglapangan /etc/nginx/sites-enabled/uanglapangan
nginx -t && systemctl reload nginx
```

`nginx -t` harus menjawab *syntax is ok*; bila tidak, Nginx **tidak** dimuat ulang dan situs lain
tetap berjalan seperti semula — hapus file `sites-enabled/uanglapangan` lalu periksa.
(Server tanpa folder `sites-available`: simpan sebagai `/etc/nginx/conf.d/uanglapangan.conf`
dan lewati baris `ln`.)

## 6. HTTPS

```bash
certbot --nginx -d $DOMAIN
```

Bila `certbot` belum ada: `apt install -y certbot python3-certbot-nginx`. Certbot hanya menyentuh
blok subdomain ini dan memperpanjang sertifikat otomatis. Setelah itu buka `https://<subdomain>`.

## 7. Jadwal backup

Satu baris cron, tiap jam: menjalankan backup terjadwal ke Google Drive pengguna yang jatuh tempo
dan, sekali sehari, menyalin database ke `data/salinan-db/` (7 hari terakhir disimpan).

```bash
(crontab -l 2>/dev/null; echo "7 * * * * cd /opt/uanglapangan && $(command -v node) --env-file=.env.production deploy/vps/tugas-terjadwal.mjs >> /var/log/uanglapangan-cron.log 2>&1") | crontab -
```

Coba sekali sekarang: `node --env-file=.env.production deploy/vps/tugas-terjadwal.mjs`

## 8. Cek

- [ ] `https://<subdomain>/daftar` → buat akun, keluar, masuk lagi.
- [ ] Buat proyek, catat pengeluaran dengan foto struk → foto tampil.
- [ ] `https://<subdomain>/api/diagnostik` (setelah masuk) → `database.ok`, `penyimpanan.ok`
      (driver `local`), `simpanFoto.ok` semuanya `true`.
- [ ] Aplikasi lain di server masih berjalan normal.
- [ ] APK Android: build dengan `CAP_SERVER_URL=https://<subdomain>`
      (lihat [PANDUAN-ANDROID.md](PANDUAN-ANDROID.md)).

---

## Memperbarui aplikasi

```bash
bash /opt/uanglapangan/deploy/vps/perbarui.sh
```

Aplikasi terganggu ±1–3 menit selama build. Data di `data/` tidak disentuh.

## Perintah sehari-hari

| Keperluan | Perintah |
|---|---|
| Status | `pm2 status uanglapangan` |
| Log | `pm2 logs uanglapangan --lines 100` |
| Restart | `pm2 restart uanglapangan` |
| Log jadwal backup | `tail -50 /var/log/uanglapangan-cron.log` |
| Ukuran data | `du -sh /opt/uanglapangan/data` |

## Pindah ke VPS lain

Seluruh isi aplikasi ada di dua tempat: folder `data/` (database, foto, arsip) dan file
`.env.production` (kunci rahasia). Kode diambil ulang dari GitHub.

1. **VPS lama** — kemas data (aplikasi berhenti beberapa detik):
   ```bash
   bash /opt/uanglapangan/deploy/vps/ekspor.sh
   ```
   Skrip mencetak nama berkas hasilnya dan perintah `scp` untuk menyalinnya.
2. **VPS baru** — pasang Node.js, Nginx, PM2, lalu:
   ```bash
   git clone https://github.com/harirureror/PencatatanUang.git /opt/uanglapangan
   cd /opt/uanglapangan
   bash deploy/vps/impor.sh ~/uanglapangan-pindah-<tanggal>.tar.gz
   bash deploy/vps/perbarui.sh
   ```
   Lanjutkan langkah 5 dan 7 di atas (Nginx, cron). Jangan jalankan langkah 3 — file env sudah
   ikut terbawa; kunci yang sama membuat pengguna tetap masuk dan Google Drive tetap terhubung.
3. Hentikan aplikasi di VPS lama supaya tidak ada catatan baru yang tertinggal:
   `pm2 stop uanglapangan`. (Catatan yang dibuat di VPS lama setelah langkah 1 tidak ikut pindah
   — lakukan langkah 1–3 berurutan tanpa jeda panjang.)
4. Ubah record DNS `A` subdomain ke IP VPS baru, tunggu menyebar, lalu jalankan langkah 6 (HTTPS)
   di VPS baru.
5. Setelah yakin semuanya berjalan, hapus berkas `uanglapangan-pindah-*.tar.gz` di kedua server
   — isinya data keuangan dan kunci rahasia.

Karena alamatnya tetap subdomain yang sama, APK Android dan pengaturan Google tidak perlu diubah.

Pindah ke Vercel + Turso + R2 juga bisa: foto dipindahkan dengan `npm run storage:migrate`,
database diunggah ke Turso dari file `data/uanglapangan.db` (lihat dokumentasi Turso tentang
impor file SQLite); langkah lainnya di [DEPLOY.md](DEPLOY.md).
