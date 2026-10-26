# Deploy UangLapangan ke VPS (Hostinger, Ubuntu) + Google Drive + salinan di Vercel

Susunan akhirnya:

| Bagian | Peran | Data |
|---|---|---|
| **VPS** (Bagian A) | Aplikasi utama — tempat tim mencatat | Database & foto di folder `data/` pada disk VPS |
| **Google Drive** (Bagian B) | Backup terjadwal tiap pengguna | Arsip ZIP di Drive masing-masing |
| **Vercel** (Bagian C) | Salinan harian, hanya untuk melihat | Disalin tiap malam dari VPS ke Turso + R2 |

Untuk VPS Linux dengan akses root yang sudah punya **Nginx**, **PM2**, dan **Node.js 20+** —
misalnya VPS yang sudah menjalankan aplikasi lain. UangLapangan dipasang berdampingan: port
sendiri (`3100`), blok Nginx sendiri, proses PM2 sendiri. Aplikasi lain di server tidak diubah.

Semua perintah dijalankan di VPS lewat SSH sebagai root. Di setiap sesi SSH baru, isi dulu
subdomain Anda sekali (ganti dengan subdomain yang sebenarnya), supaya perintah di bawah bisa
disalin apa adanya:

```bash
DOMAIN=kas.domainanda.com
```

> File `.env.production` di server berisi kunci rahasia. Isinya diketik/ditempel langsung di
> server (`nano`), jangan ditempel ke chat, email, atau repo.

---

# Bagian A — Aplikasi utama di VPS

## A1. Arahkan subdomain ke VPS

Di pengelola DNS domain Anda (Hostinger: **hPanel → Domains → DNS / Nameservers**), tambahkan:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `kas` | alamat IP VPS | 300 |

Cek dari VPS (hasilnya harus IP VPS; bisa perlu beberapa menit):

```bash
getent hosts $DOMAIN
```

## A2. Ambil kode

```bash
git clone https://github.com/harirureror/PencatatanUang.git /opt/uanglapangan
cd /opt/uanglapangan
```

## A3. Buat file env

Perintah ini membuat keempat kunci rahasia langsung ke dalam file — tidak perlu disalin tangan,
dan tidak tampil di layar:

```bash
cd /opt/uanglapangan
node scripts/generate-secrets.mjs > .env.production
echo "BETTER_AUTH_URL=https://$DOMAIN" >> .env.production
chmod 600 .env.production
```

Jangan isi `DATABASE_URL` maupun `R2_*` — dikosongkan berarti memakai folder `data/`.

## A4. Pasang & jalankan

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

## A5. Nginx

```bash
sed "s/kas.domainanda.com/$DOMAIN/" deploy/vps/nginx.conf > /etc/nginx/sites-available/uanglapangan
ln -s /etc/nginx/sites-available/uanglapangan /etc/nginx/sites-enabled/uanglapangan
nginx -t && systemctl reload nginx
```

`nginx -t` harus menjawab *syntax is ok*; bila tidak, Nginx **tidak** dimuat ulang dan situs lain
tetap berjalan seperti semula — hapus file `sites-enabled/uanglapangan` lalu periksa.

## A6. HTTPS

```bash
apt install -y certbot python3-certbot-nginx   # lewati bila certbot sudah ada
certbot --nginx -d $DOMAIN
```

Certbot hanya menyentuh blok subdomain ini dan memperpanjang sertifikat otomatis. Setelah itu
buka `https://<subdomain>`.

## A7. Tugas terjadwal

Satu baris cron, tiap jam. Isinya: backup terjadwal ke Google Drive pengguna yang jatuh tempo;
sekali sehari salinan database ke `data/salinan-db/` (7 hari terakhir); dan — setelah Bagian C
diatur — sekali sehari penyalinan ke Vercel.

```bash
echo "7 * * * * root cd /opt/uanglapangan && $(command -v node) --env-file=.env.production deploy/vps/tugas-terjadwal.mjs >> /var/log/uanglapangan-cron.log 2>&1" > /etc/cron.d/uanglapangan
chmod 644 /etc/cron.d/uanglapangan
```

Jadwal disimpan di berkasnya sendiri (`/etc/cron.d/uanglapangan`), bukan di crontab root: di server
bersama, crontab root bisa tertimpa saat orang lain memasang jadwal aplikasinya
(`echo … | crontab -`), dan jadwal ini ikut hilang tanpa pemberitahuan.

Coba sekali sekarang: `node --env-file=.env.production deploy/vps/tugas-terjadwal.mjs`

## A8. Cek

- [ ] `https://<subdomain>/daftar` → buat akun, keluar, masuk lagi.
- [ ] Buat proyek, catat pengeluaran dengan foto struk → foto tampil.
- [ ] `https://<subdomain>/api/diagnostik` (setelah masuk) → `database.ok`, `penyimpanan.ok`
      (driver `local`), `simpanFoto.ok` semuanya `true`.
- [ ] Aplikasi lain di server masih berjalan normal.
- [ ] APK Android: build dengan `CAP_SERVER_URL=https://<subdomain>`
      (lihat [PANDUAN-ANDROID.md](PANDUAN-ANDROID.md)).

---

# Bagian B — Backup ke Google Drive

Tiap pengguna menghubungkan Google Drive miliknya sendiri; aplikasi hanya bisa melihat file yang
dibuatnya sendiri (izin `drive.file`). Yang disiapkan sekali oleh pengelola:

## B1. Google Cloud

1. Buka <https://console.cloud.google.com> → buat project (mis. "UangLapangan").
2. **APIs & Services → Library** → cari **Google Drive API** → *Enable*.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform): tipe **External**, isi nama
   aplikasi dan email. Di *Data Access / Scopes* tambahkan `.../auth/drive.file`.
4. Di *Audience*, klik **Publish app** sampai statusnya **In production**.
   > Penting: selama status *Testing*, izin Drive kedaluwarsa tiap 7 hari dan backup terjadwal
   > berhenti diam-diam. Izin `drive.file` tidak memerlukan verifikasi Google untuk dipublikasikan.
5. **Credentials → Create credentials → OAuth client ID** → *Web application*. Di **Authorized
   redirect URIs** isi persis: `https://<subdomain>/api/drive/callback`
6. Catat **Client ID** dan **Client secret**.

## B2. Pasang di VPS

```bash
cd /opt/uanglapangan
nano .env.production
```

Tambahkan tiga baris (ganti nilainya), simpan (`Ctrl+O`, `Enter`, `Ctrl+X`):

```
GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=https://<subdomain>/api/drive/callback
```

```bash
node --env-file=.env.production scripts/check-env.mjs
pm2 restart uanglapangan --update-env
```

## B3. Hubungkan (tiap pengguna)

1. Di aplikasi: **Pengaturan → Backup ke Google Drive → Hubungkan Google Drive**.
2. Pilih akun Google → izinkan. (Bila muncul "Google hasn't verified this app": *Advanced →
   Go to …* — wajar untuk aplikasi internal.)
3. Atur **Jadwal** → tekan **Backup sekarang**.
4. Cek di Google Drive: folder **UangLapangan Backup** berisi `uanglapangan-<tanggal>.zip`.

Backup terjadwal dijalankan cron di A7. Pulihkan data dari halaman yang sama (pilih arsip →
pulihkan).

---

# Bagian C — Vercel sebagai salinan harian

Deploy Vercel yang sudah ada dibiarkan, tetapi diubah menjadi **salinan hanya-lihat**: tiap malam
VPS menyalin seluruh database ke Turso dan foto ke R2 (yang dipakai Vercel). Bila VPS bermasalah,
tim tetap bisa membuka alamat Vercel untuk melihat data per salinan terakhir.

Di salinan: masuk, melihat catatan/foto, dan unduh laporan tetap bisa; menyimpan ditolak.
Pita biru di atas halaman menunjukkan waktu salinan dan tautan ke aplikasi utama.

## C1. Pasang penyalin di VPS

Ambil enam nilai dari **Vercel → Project → Settings → Environment Variables** (yang dipakai
deploy sekarang): `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Bila Vercel tidak mau menampilkan nilainya (variabel
bertanda *Sensitive*), buat token baru di dasbor Turso dan API token baru di Cloudflare R2 —
token lama di Vercel tetap berlaku. Di VPS (`nano .env.production`) tulis dengan awalan
`MIRROR_`:

```
MIRROR_DATABASE_URL=<nilai DATABASE_URL di Vercel>
MIRROR_DATABASE_AUTH_TOKEN=<nilai DATABASE_AUTH_TOKEN di Vercel>
MIRROR_R2_ACCOUNT_ID=<nilai R2_ACCOUNT_ID di Vercel>
MIRROR_R2_ACCESS_KEY_ID=<nilai R2_ACCESS_KEY_ID di Vercel>
MIRROR_R2_SECRET_ACCESS_KEY=<nilai R2_SECRET_ACCESS_KEY di Vercel>
MIRROR_R2_BUCKET=<nilai R2_BUCKET di Vercel>
```

Awalan `MIRROR_` wajib: tanpa awalan, aplikasi di VPS ikut pindah memakai Turso/R2.

## C2. Penyalinan pertama

```bash
cd /opt/uanglapangan
node --env-file=.env.production scripts/salin-data.mjs --uji
```

`--uji` hanya melaporkan jumlah baris dan berkas, tanpa mengubah apa pun. Bila laporannya wajar:

```bash
node --env-file=.env.production scripts/salin-data.mjs --timpa
```

> `--timpa` diperlukan sekali ini karena database Vercel sekarang berisi data uji. **Data itu
> diganti seluruhnya dengan data VPS.** Penyalinan berikutnya berjalan sendiri tanpa `--timpa`.

## C3. Jadikan Vercel hanya-lihat

**Vercel → Settings → Environment Variables** → tambah `MIRROR_OF` = `https://<subdomain>`
(lingkungan Production) → **Deployments → Redeploy**. Buka alamat Vercel: pita "Salinan
cadangan per …" harus muncul dan datanya sama dengan VPS.

Mulai sekarang cron di A7 menyalin sekali sehari. Hasilnya tercatat di
`/var/log/uanglapangan-cron.log`.

## C4. Keadaan darurat: VPS mati lama

1. **Vercel jadi aplikasi utama:** hapus env `MIRROR_OF` di Vercel → Redeploy. Tim mencatat di
   alamat Vercel (data per salinan terakhir; catatan di VPS setelah salinan itu belum ikut).
2. Saat VPS hidup lagi, penyalin **menolak** menimpa Vercel (ia mendeteksi ada catatan baru di
   sana) — tidak ada yang hilang diam-diam; log cron mencatat penolakannya.
3. **Kembali ke VPS:**
   ```bash
   pm2 stop uanglapangan
   cd /opt/uanglapangan
   node --env-file=.env.production scripts/salin-data.mjs --arah dari-salinan --timpa
   pm2 start uanglapangan
   ```
   Ini mengganti data VPS dengan data Vercel (catatan yang hanya ada di VPS hilang — ekspor dulu
   dengan `deploy/vps/ekspor.sh` bila perlu). Lalu pasang lagi `MIRROR_OF` di Vercel → Redeploy.

APK Android menunjuk ke satu alamat (subdomain VPS). Selama darurat, tim memakai alamat Vercel
lewat browser HP.

---

# Tiga lapis cadangan

| Lapis | Isi | Seberapa baru | Melindungi dari |
|---|---|---|---|
| Google Drive (B) | Arsip ZIP per pengguna, di Drive masing-masing | Sesuai jadwal pengguna | Salah hapus, VPS hilang total |
| `data/salinan-db/` di VPS (A7) | Salinan database, 7 hari | Harian | Database rusak / salah ubah |
| Vercel + Turso + R2 (C) | Seluruh data, bisa langsung dibuka | Harian | VPS mati — tim tetap bisa melihat |

---

# Perawatan

## Memperbarui aplikasi

```bash
bash /opt/uanglapangan/deploy/vps/perbarui.sh
```

Aplikasi terganggu ±1–3 menit selama build. Data di `data/` tidak disentuh. Vercel memperbarui
dirinya sendiri dari GitHub; penyalin menyamakan susunan database salinan saat menyalin.

## Perintah sehari-hari

| Keperluan | Perintah |
|---|---|
| Status | `pm2 status uanglapangan` |
| Log | `pm2 logs uanglapangan --lines 100` |
| Restart | `pm2 restart uanglapangan` |
| Log tugas terjadwal | `tail -50 /var/log/uanglapangan-cron.log` |
| Ukuran data | `du -sh /opt/uanglapangan/data` |
| Salin ke Vercel sekarang | `node --env-file=.env.production scripts/salin-data.mjs` |

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
   Lanjutkan A5 dan A7 (Nginx, cron). Jangan jalankan A3 — file env sudah ikut terbawa; kunci
   yang sama membuat pengguna tetap masuk, Google Drive tetap terhubung, dan penyalinan ke
   Vercel tetap jalan.
3. Hentikan aplikasi di VPS lama supaya tidak ada catatan baru yang tertinggal:
   `pm2 stop uanglapangan`, dan hapus jadwalnya (`rm /etc/cron.d/uanglapangan`). Catatan yang dibuat di VPS
   lama setelah langkah 1 tidak ikut pindah — lakukan langkah 1–3 berurutan tanpa jeda panjang.
4. Ubah record DNS `A` subdomain ke IP VPS baru, tunggu menyebar, lalu jalankan A6 (HTTPS) di
   VPS baru.
5. Setelah yakin semuanya berjalan, hapus berkas `uanglapangan-pindah-*.tar.gz` di kedua server
   — isinya data keuangan dan kunci rahasia.

Karena alamatnya tetap subdomain yang sama, APK Android dan pengaturan Google tidak perlu diubah.
