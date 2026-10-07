import type { CapacitorConfig } from "@capacitor/cli";

// Aplikasi Android membungkus web UangLapangan yang sudah di-deploy (server.url).
// Atur alamatnya lewat variabel lingkungan saat `npx cap sync android`:
//   CAP_SERVER_URL=https://uanglapangan.example.com   → APK untuk dipakai tim
//   CAP_SERVER_URL=http://192.168.1.10:3000            → mencoba di HP via Wi-Fi yang sama (dev)
// Catatan: dokumentasi Capacitor menyebut server.url "tidak ditujukan untuk produksi" —
// aman untuk APK yang dipasang sendiri; pertimbangkan ulang bila ingin rilis di Play Store.
// Proyek native ada di android/ (dibuat `npx cap add android`; izin kamera & aturan http per
// jenis build sudah diatur di sana). Setelah mengubah file ini: `npm run android:sync`.
const serverUrl = process.env.CAP_SERVER_URL ?? "http://10.0.2.2:3000"; // 10.0.2.2 = localhost di emulator Android

const config: CapacitorConfig = {
  appId: "com.uanglapangan.app",
  appName: "UangLapangan",
  // Isi bawaan APK: hanya halaman cadangan saat web tidak bisa dimuat (offline).
  webDir: "capacitor-www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"), // izinkan http hanya untuk alamat dev
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      backgroundColor: "#0f5c45",
      style: "DARK", // ikon status bar terang di atas latar hijau
      overlaysWebView: false,
    },
  },
};

export default config;
