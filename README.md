This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Database & hub sinkron (UangLapangan)

Data disimpan local-first: tiap perangkat punya SQLite sendiri (browser: OPFS lewat
`src/lib/local/db`), dan server memegang DB pusat yang menjadi **hub** sinkron antarperangkat.

| Lingkungan | `DATABASE_URL` | Catatan |
|---|---|---|
| Lokal (dev) | kosong → `file:./data/uanglapangan.db` | Tidak perlu akun apa pun |
| Produksi | `libsql://<nama-db>-<org>.turso.io` | Isi juga `DATABASE_AUTH_TOKEN` |

Menyiapkan hub Turso (sekali):

```bash
turso db create uanglapangan                 # buat DB di Turso (plan gratis cukup)
turso db show uanglapangan --url             # → isi DATABASE_URL
turso db tokens create uanglapangan          # → isi DATABASE_AUTH_TOKEN (simpan sebagai secret)
npm run db:migrate                           # jalankan dengan dua variabel di atas terpasang
npm run db:seed                              # kategori bawaan (+ "-- --contoh" untuk data contoh)
```

`drizzle.config.ts` memilih dialek `turso` otomatis bila `DATABASE_URL` bukan `file:`. Migrasi yang
sama dipakai lokal dan di Turso — jangan ubah file migrasi yang sudah dijalankan.

Metadata sinkron di hub:

- Tabel tersinkron (`projects`, `categories`, `transactions`, `receipts`, `settings`) memakai id
  UUID, `updated_at` (yang terbaru menang saat bentrok), `deleted_at` (soft delete) dan `rev`.
- `rev` diisi trigger dari `sync_counter` setiap baris berubah; perangkat menarik perubahan dengan
  `rev > kursor terakhir` sehingga tidak ada perubahan yang terlewat walau jam perangkat berbeda.
- `sync_devices` mencatat perangkat per pengguna (web/android/desktop) beserta kursor tarik dan
  waktu terakhir kirim/tarik — dasar token sinkron per perangkat.

Token sinkron (`POST /api/sync/token`): perangkat menukar sesi login menjadi token berumur 15 menit
untuk `/api/sync/pull` dan `/api/sync/push`. Token database Turso **tidak pernah** dikirim ke
perangkat (token Turso berlaku untuk seluruh database, semua pengguna). Di produksi isi
`SYNC_TOKEN_SECRET` dengan minimal 32 karakter acak, mis. `openssl rand -base64 48`; di mode dev
boleh kosong (dipakai kunci sementara).

Akun (Better Auth): daftar / masuk dengan email atau nomor HP + sandi, lupa sandi lewat tautan
email atau kode 6 digit. Tabel `users`, `sessions`, `accounts` (hash sandi), `verifications`,
`rate_limits` (migrasi `0016`). `src/proxy.ts` memeriksa sesi untuk setiap halaman & API dan
meneruskan id pengguna ke server, jadi tiap akun hanya melihat datanya sendiri. Env:

- `BETTER_AUTH_SECRET` — wajib di produksi, minimal 32 karakter acak (`openssl rand -base64 48`).
- `BETTER_AUTH_URL` — alamat publik aplikasi, mis. `https://uanglapangan.vercel.app` (dipakai
  juga untuk tautan atur ulang sandi di email).
- Email atur ulang sandi memakai Resend (`RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`); kode untuk akun
  nomor HP dikirim lewat WhatsApp memakai Fonnte (`FONNTE_TOKEN`). Tanpa konfigurasi, di mode dev
  tautan / kode dicetak di log server.

Penyimpanan berkas (foto struk, arsip backup sementara): Cloudflare R2 bila `R2_*` diisi (wajib di
Vercel), selain itu folder `data/`. Pindahkan berkas lama ke R2 dengan `npm run storage:migrate`.

**Deploy produksi (Vercel + Turso + R2 + Google Drive + Resend + Fonnte): lihat
[docs/DEPLOY.md](docs/DEPLOY.md).** Semua variabel ada di [.env.example](.env.example);
`npm run env:secrets` membuat secret, `node --env-file=<file> scripts/check-env.mjs` memeriksanya.

Akun demo pengembangan (`npm run db:seed`): `demo@uanglapangan.id` / `0812 3456 7890`, sandi
`lapangan123`. Jangan jalankan seed di produksi.

Format uang & konversi: semua nominal disimpan dalam **Rupiah**. Bila pengguna memilih mata uang
lain (Pengaturan → Format uang), nominal dikonversi saat ditampilkan memakai kurs referensi Bank
Sentral Eropa dari [Frankfurter](https://frankfurter.dev) (gratis, tanpa kunci; di-cache 6 jam di
server, kurs terakhir dipakai bila sumber tidak bisa dihubungi). Isian nominal tetap dalam Rupiah;
laporan Excel tetap Rupiah. Sumber bisa diganti lewat env `EXCHANGE_RATES_URL`.

Backup terjadwal: `vercel.json` memanggil `GET /api/cron/backup` tiap hari 19.00 UTC (02.00 WIB).
Isi `CRON_SECRET` (acak, mis. `openssl rand -hex 32`) — Vercel Cron mengirimnya sebagai
`Authorization: Bearer …`; tanpa itu endpoint menolak di produksi. Arsip per pengguna berupa ZIP
(`uanglapangan-YYYY-MM-DD.zip`, format `uanglapangan-backup` v1): `data.json`, foto di `struk/`,
`manifest.json` (SHA-256 tiap file) dan `BACA-SAYA.txt`; checksum seluruh arsip & `source_rev`
dicatat di `backup_archives`. Sementara disimpan di `data/backups/` sebelum diunggah ke Google
Drive pengguna.

Menghubungkan Google Drive (OAuth, sekali di Google Cloud Console):

1. Buat proyek → **APIs & Services** → aktifkan **Google Drive API**.
2. **OAuth consent screen**: tipe *External*, status *Testing* (cukup untuk pemakaian pribadi), tambahkan
   akun Gmail Anda sebagai *test user*, scope `drive.file`, `openid`, `email`.
3. **Credentials** → *Create OAuth client ID* → *Web application* → *Authorized redirect URI*:
   `https://<domain-anda>/api/drive/callback` (dev: `http://localhost:3000/api/drive/callback`).
4. Isi env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan `DRIVE_TOKEN_KEY` (acak ≥ 32 karakter,
   mis. `openssl rand -base64 32`) untuk mengenkripsi token di database. `GOOGLE_REDIRECT_URI`
   opsional bila alamat di balik proxy berbeda.

Izin yang diminta hanya `drive.file` (aplikasi hanya bisa melihat file buatannya sendiri). Refresh
token disimpan terenkripsi (AES-256-GCM) dan tidak pernah dikirim ke perangkat; "Putuskan" mencabut
izin di Google. Tanpa `GOOGLE_CLIENT_ID`/`SECRET`, mode dev menawarkan koneksi **simulasi** untuk
mencoba alur backup (arsip tidak diunggah).

Pemberitahuan backup gagal: selalu tampil sebagai spanduk di dashboard & Sinkronisasi (sampai
ditutup atau backup berikutnya berhasil). Email untuk backup **terjadwal** yang gagal dikirim lewat
[Resend](https://resend.com) bila `RESEND_API_KEY` dan `NOTIFY_EMAIL_FROM` (mis.
`UangLapangan <notif@domain-anda.id>`) diisi — sekali per rangkaian kegagalan, ke email akun atau
akun Google Drive yang terhubung.

## Aplikasi Android (Capacitor)

Proyek native ada di `android/`. APK membungkus web yang sudah di-deploy (`server.url` di
`capacitor.config.ts`); isi bawaannya hanya halaman cadangan offline (`capacitor-www/`).

Kebutuhan sekali pasang: **Android Studio** (sudah termasuk JDK 21 & Android SDK). Lalu:

```bash
# alamat web yang dibuka APK (dev di emulator: http://10.0.2.2:3000; HP lewat Wi-Fi: http://<IP-PC>:3000)
CAP_SERVER_URL=https://uanglapangan.domain-anda.id npm run android:sync
npm run android:apk     # APK debug → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:open    # atau buka di Android Studio untuk emulator / build rilis
```

- Versi APK mengikuti `version` di `package.json` (`1.2.3` → versionCode `10203`).
- Build **debug** boleh memakai `http://` (server dev); build **release** hanya HTTPS.
- Izin: internet, status jaringan, kamera (diminta saat pertama memotret struk).
- APK rilis bertanda tangan: `npm run android:release` (kunci di `android/keystore.properties`).
  Panduan lengkap memasang di HP & membuat APK: [docs/PANDUAN-ANDROID.md](docs/PANDUAN-ANDROID.md).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
