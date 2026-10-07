# UangLapangan untuk Android

Dua bagian: **memasang aplikasi di HP** (untuk semua pengguna) dan **membuat file APK**
(untuk yang mengurus aplikasinya).

---

## Bagian 1 — Memasang di HP

Yang dibutuhkan: HP Android 7.0 atau lebih baru, dan file `UangLapangan-<versi>.apk` yang
dibagikan pengurus aplikasi (lewat WhatsApp, Google Drive, atau kabel data).

1. **Unduh file APK** ke HP.
2. **Buka file tersebut** (dari notifikasi unduhan atau aplikasi *File*).
3. Bila muncul *"Untuk keamanan, HP Anda tidak diizinkan memasang aplikasi dari sumber ini"*:
   ketuk **Setelan** → aktifkan **Izinkan dari sumber ini** → tekan tombol kembali.
4. Ketuk **Pasang**. Bila Google Play Protect bertanya, pilih **Tetap pasang** — aplikasi ini
   dipasang langsung, tidak lewat Play Store.
5. Buka **UangLapangan** dari layar utama.

### Pertama kali dibuka
- Aplikasi perlu **internet** saat pertama dibuka untuk mengambil data proyek. Setelah itu,
  mencatat tetap bisa walau tanpa sinyal — catatan dikirim otomatis saat sinyal kembali.
- Saat pertama memotret struk, aplikasi meminta **izin kamera**. Pilih *Izinkan saat aplikasi
  digunakan*. Bila terlanjur menolak: **Setelan HP → Aplikasi → UangLapangan → Izin → Kamera**.

### Memperbarui ke versi baru
Pasang file APK versi baru dengan cara yang sama — **tidak perlu mencopot** versi lama. Data
dan catatan yang belum terkirim tetap aman.

> Bila muncul *"Aplikasi tidak terpasang"* saat memperbarui, APK baru ditandatangani dengan kunci
> berbeda. Hubungi pengurus aplikasi; jangan mencopot aplikasi lama sebelum semua catatan
> terkirim (lihat menu **Sinkronisasi** → "Menunggu dikirim" harus kosong).

### Bila ada masalah
| Gejala | Yang dilakukan |
|---|---|
| Muncul layar "Tidak ada koneksi" | Periksa data seluler / Wi-Fi, lalu ketuk **Coba lagi**. |
| Catatan offline belum terkirim | Buka **Sinkronisasi** → **Sinkron sekarang** saat ada sinyal. |
| Ada catatan di "Perlu tindakan" | Pilih versi yang benar (versi Anda atau versi di server). |
| Kamera tidak terbuka | Periksa izin kamera (lihat di atas), atau pilih foto **Dari galeri**. |

---

## Bagian 2 — Membuat file APK (pengurus aplikasi)

Aplikasi Android membuka **web UangLapangan yang sudah di-deploy** (alamatnya ditanam saat
build). Jadi pastikan web sudah online lebih dulu dengan alamat **HTTPS**.

### Sekali pasang
Pilih salah satu:
- **Android Studio** (paling mudah; sudah berisi JDK 21 dan Android SDK). Buka sekali agar SDK
  terunduh.
- **Tanpa Android Studio** (cara yang dipakai di PC pengembangan, tanpa hak administrator):
  1. JDK 21: unduh zip **Microsoft Build of OpenJDK 21**
     (<https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip>), ekstrak ke
     `%LOCALAPPDATA%\Programs\jdk-21`.
  2. Android command-line tools: <https://developer.android.com/studio#command-line-tools-only>,
     ekstrak ke `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`.
  3. Atur variabel pengguna `JAVA_HOME` (folder JDK) dan `ANDROID_HOME`
     (`%LOCALAPPDATA%\Android\Sdk`), lalu tambahkan `%JAVA_HOME%\bin` ke `Path`.
  4. Pasang komponen SDK (sesuai `android/variables.gradle`, compileSdk 36):
     ```bash
     sdkmanager --licenses
     sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
     ```

Lalu di folder proyek: `npm install`.
3. **Buat kunci tanda tangan** (sekali saja, di folder `android/`):
   ```bash
   keytool -genkeypair -v -keystore uanglapangan-release.jks -alias uanglapangan -keyalg RSA -keysize 2048 -validity 10000
   ```
   Salin `android/keystore.properties.example` menjadi `android/keystore.properties`, isi
   sandinya. **Simpan file `.jks` dan sandinya di tempat aman** (mis. pengelola sandi) —
   tanpa kunci yang sama, pembaruan APK tidak bisa dipasang di atas versi lama. Kedua file ini
   sengaja tidak masuk git.

### Setiap rilis
1. Naikkan `version` di `package.json` (mis. `0.1.0` → `0.2.0`) — versi APK mengikutinya.
2. Bangun APK rilis dengan alamat web produksi:
   ```bash
   # PowerShell: $env:CAP_SERVER_URL="https://uanglapangan.domain-anda.id"; npm run android:release
   CAP_SERVER_URL=https://uanglapangan.domain-anda.id npm run android:release
   ```
   Hasil: `android/app/build/outputs/apk/release/app-release.apk` → ganti nama menjadi
   `UangLapangan-<versi>.apk` lalu bagikan.

### Mencoba saat pengembangan
```bash
npm run dev                                   # server di komputer
CAP_SERVER_URL=http://10.0.2.2:3000 npm run android:apk        # untuk emulator Android
CAP_SERVER_URL=http://<IP-komputer>:3000 npm run android:apk   # HP di Wi-Fi yang sama
```
APK debug: `android/app/build/outputs/apk/debug/app-debug.apk`. Hanya build **debug** yang
boleh memakai `http://`; build rilis wajib `https://`.

### Catatan teknis
- Plugin native: kamera, sistem file (foto), SQLite (data di HP), status bar, tombol kembali.
- Data di HP disimpan di SQLite native dan disinkronkan ke server; backup otomatis Android
  dimatikan (`allowBackup=false`) karena data di HP hanya salinan dari server.
- `server.url` (membungkus web yang di-deploy) cocok untuk APK yang dibagikan sendiri. Untuk
  rilis di Google Play, pertimbangkan membundel aset web di dalam APK.
