import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ada package-lock.json di folder home; kunci root ke folder proyek ini.
  turbopack: {
    root: __dirname,
  },
  // Mode dev: izinkan membuka aplikasi dari HP / emulator lewat jaringan lokal (tanpa ini file
  // JavaScript dev diblokir sehingga halaman tidak interaktif, mis. tombol Masuk tidak jalan).
  allowedDevOrigins: ["127.0.0.1", "10.0.2.2", "192.168.*.*", "10.*.*.*", "172.*.*.*"],
  experimental: {
    serverActions: {
      // Foto struk ikut terkirim bersama form: maks 4 MB foto (MAX_UPLOAD_BYTES) + isian lain.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
