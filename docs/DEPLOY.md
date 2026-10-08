# Deploy UangLapangan ke produksi (Vercel + Turso)

Panduan dari nol sampai aplikasi bisa dipakai tim. Urutannya penting: siapkan layanan dulu,
kumpulkan nilai env, baru deploy. Semua nama variabel ada di [`.env.example`](../.env.example).

Ringkasan layanan:

| Kebutuhan | Layanan | Wajib? | Biaya awal |
|---|---|---|---|
| Hosting aplikasi + jadwal backup | Vercel | Wajib | Gratis (Hobby) |
| Database pusat (hub sinkron) | Turso | Wajib | Gratis |
| Foto struk & arsip sementara | Cloudflare R2 | Wajib di Vercel | Gratis s.d. 10 GB |
| Backup ke Drive pengguna | Google Cloud (OAuth) | Disarankan (boleh menyusul) | Gratis |
| Email lupa sandi & notifikasi | Resend | Disarankan | Gratis 3.000/bulan |
| Kode lupa sandi via WhatsApp | Fonnte | Disarankan | Paket Fonnte |

---

## 0. Buat secret

```bash
npm run env:secrets
```

Simpan keempat nilainya (`BETTER_AUTH_SECRET`, `SYNC_TOKEN_SECRET`, `CRON_SECRET`,
`DRIVE_TOKEN_KEY`) di pengelola sandi. Jangan diganti setelah aplikasi dipakai: mengganti
`BETTER_AUTH_SECRET` membuat semua pengguna keluar, mengganti `DRIVE_TOKEN_KEY` memutus koneksi
Google Drive semua pengguna.

## 1. Turso (database)

1. Pasang CLI: <https://docs.turso.tech/cli/installation>, lalu `turso auth login`.
2. Buat database di region **Tokyo** (`aws-ap-northeast-1`) — Turso tidak punya Singapura; bila
   Tokyo tidak tersedia pilih Mumbai (`aws-ap-south-1`). Lewat dasbor app.turso.tech
   (*Create Database* → pilih region) atau CLI:
   ```bash
   turso db create uanglapangan --group default   # region mengikuti group; pilih Tokyo saat membuat group
   turso db show uanglapangan --url        # → DATABASE_URL (libsql://…)
   turso db tokens create uanglapangan     # → DATABASE_AUTH_TOKEN
   ```
   > Server aplikasi harus se-kota dengan database: `vercel.json` sudah mengatur fungsi Vercel
   > berjalan di Tokyo (`"regions": ["hnd1"]`). Bila database Anda di Mumbai, ganti menjadi `["bom1"]`.
3. Terapkan skema (dari folder proyek, **tanpa** seed — seed hanya untuk data demo):
   ```bash
   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:migrate
   ```
   PowerShell: `$env:DATABASE_URL="libsql://…"; $env:DATABASE_AUTH_TOKEN="…"; npm run db:migrate`
4. Isi kategori bawaan (Transport, Penginapan, Konsumsi, …) sekali:
   `DATABASE_URL=… DATABASE_AUTH_TOKEN=… npm run db:seed -- --hanya-kategori`

> Catatan: `npm run db:seed` tanpa opsi juga membuat **akun demo dengan sandi bawaan** —
> jangan jalankan itu ke database produksi.

## 2. Cloudflare R2 (foto struk)

1. Dasbor Cloudflare → **R2** → *Create bucket* `uanglapangan-struk` (lokasi APAC). Biarkan
   **tanpa** akses publik.
2. **Manage R2 API Tokens** → *Create API token* → izin **Object Read & Write**, batasi ke bucket
   tadi. Catat `Access Key ID` dan `Secret Access Key` (hanya muncul sekali).
3. `R2_ACCOUNT_ID` = Account ID di halaman R2. `R2_BUCKET` = nama bucket.
4. Sudah punya foto di folder `data/` (dari server lama)? Pindahkan sekali:
   `node --env-file=.env.production scripts/migrate-storage-to-r2.mjs --dry-run` lalu tanpa `--dry-run`.

## 3. Google Cloud (backup ke Google Drive pribadi)

Boleh dikerjakan belakangan: tanpa langkah ini aplikasi tetap berjalan, hanya tombol *Hubungkan
Google Drive* di menu Backup belum berfungsi. Setelah mengisi `GOOGLE_*` di Vercel, klik *Redeploy*.

1. <https://console.cloud.google.com> → buat project → **APIs & Services → Library** → aktifkan
   **Google Drive API**.
2. **OAuth consent screen**: tipe *External*, isi nama aplikasi & email; scope
   `.../auth/drive.file` (hanya file yang dibuat aplikasi). Selama status *Testing*, tambahkan
   email tim sebagai *Test users*; untuk umum ajukan *Publish*.
3. **Credentials → Create OAuth client ID** → *Web application*. Authorized redirect URI:
   `https://<domain-anda>/api/drive/callback` (sama persis dengan `GOOGLE_REDIRECT_URI`).
4. Salin Client ID & Secret ke `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## 4. Resend (email)

1. <https://resend.com> → *Domains* → tambahkan domain Anda, pasang record DNS (SPF/DKIM) sampai
   *Verified*.
2. *API Keys* → buat key (izin *Sending*) → `RESEND_API_KEY`.
3. `NOTIFY_EMAIL_FROM=UangLapangan <notif@domain-anda>`.

## 5. Fonnte (WhatsApp)

1. <https://fonnte.com> → daftar → **Device** → tambah nomor WhatsApp pengirim → scan QR dari
   WhatsApp di HP (Perangkat tertaut).
2. Salin **token** perangkat → `FONNTE_TOKEN`.
3. Pakai nomor khusus (bukan nomor pribadi) dan jaga HP-nya tetap tersambung internet.

## 6. Vercel (hosting)

1. Kode harus ada di GitHub/GitLab (folder proyek ini belum repo git: `git init`, commit, push).
2. <https://vercel.com/new> → impor repo → Framework: Next.js (otomatis).
3. **Environment Variables** (Production): isi semua dari `.env.example` dengan nilai langkah
   0–5. `BETTER_AUTH_URL` dan `GOOGLE_REDIRECT_URI` memakai domain Vercel / domain sendiri.
4. Opsional — gagalkan build bila env belum lengkap: Build Command
   `node scripts/check-env.mjs && next build`.
5. Deploy. Jadwal backup harian 02.00 WIB otomatis aktif dari `vercel.json` (Vercel mengirim
   `CRON_SECRET` sebagai Bearer token).
6. Domain sendiri (opsional): *Settings → Domains*, lalu perbarui `BETTER_AUTH_URL`,
   `GOOGLE_REDIRECT_URI`, dan redirect URI di Google Cloud.

## 7. Cek setelah deploy

- [ ] Buka `/daftar`, buat akun, masuk & keluar.
- [ ] Buat proyek, catat pengeluaran dengan foto struk → foto tampil (berarti R2 jalan).
- [ ] Lupa sandi via email → email masuk; via nomor HP → pesan WhatsApp masuk.
- [ ] Backup → hubungkan Google Drive → *Backup sekarang* → folder "UangLapangan Backup" muncul di Drive.
- [ ] Rekap → *Unduh laporan Excel* berisi foto nota.
- [ ] Aplikasi Android: build APK rilis dengan `CAP_SERVER_URL=https://<domain-anda>` (lihat
      [PANDUAN-ANDROID.md](PANDUAN-ANDROID.md)).

## Pemeriksaan env lokal

```bash
node --env-file=.env.production scripts/check-env.mjs
```

Menampilkan ✓ yang sudah siap, ! yang disarankan, dan ✗ yang wajib diperbaiki.
