// Konfigurasi PM2 untuk menjalankan UangLapangan di VPS (lihat docs/DEPLOY-VPS.md).
// Aplikasi hanya mendengarkan di 127.0.0.1 — yang menghadap internet adalah Nginx (HTTPS).
// Env produksi dibaca Next.js sendiri dari file .env.production di folder aplikasi.
// Port 3000 biasanya sudah dipakai aplikasi lain di server yang sama.
const PORT = process.env.UANGLAPANGAN_PORT || "3100";

module.exports = {
  apps: [
    {
      name: "uanglapangan",
      cwd: `${__dirname}/../..`,
      script: "node_modules/next/dist/bin/next",
      args: `start -H 127.0.0.1 -p ${PORT}`,
      env: { NODE_ENV: "production" },
      max_memory_restart: "800M",
      time: true,
    },
  ],
};
