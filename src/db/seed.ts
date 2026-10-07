// Isi data awal: kategori bawaan + akun demo (masuk: demo@uanglapangan.id / 0812-3456-7890,
// sandi "lapangan123" — HANYA untuk pengembangan; jangan jalankan seed di produksi).
// Jalankan: npm run db:seed -- --hanya-kategori → kategori bawaan saja (untuk produksi)
//           npm run db:seed          → kategori bawaan & pengguna demo
//           npm run db:seed -- --contoh → plus proyek & transaksi contoh
// Aman dijalankan berulang (baris yang sudah ada dilewati).
import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull } from "drizzle-orm";

import { DEMO_USER_ID } from "./demo";
import { db } from "./index";
import { accounts, backupArchives, categories, driveConnections, projects, receipts, settings, transactions, users } from "./schema";


const defaultCategories = [
  { id: "cat-transport", name: "Transport", type: "expense" },
  { id: "cat-penginapan", name: "Penginapan", type: "expense" },
  { id: "cat-konsumsi", name: "Konsumsi", type: "expense" },
  { id: "cat-peralatan", name: "Peralatan", type: "expense" },
  { id: "cat-lain", name: "Lain-lain", type: "expense" },
  { id: "cat-dana", name: "Dana kantor", type: "income" },
  { id: "cat-masuk-lain", name: "Lain-lain", type: "income" },
] as const;

async function main() {
  const withSamples = process.argv.includes("--contoh");

  await db
    .insert(categories)
    .values(defaultCategories.map((c) => ({ ...c, userId: null, isDefault: true })))
    .onConflictDoNothing();

  // Produksi: cukup kategori bawaan — tanpa akun demo bersandi bawaan.
  if (process.argv.includes("--hanya-kategori")) {
    console.log("✓ Kategori bawaan siap.");
    return;
  }

  const demo = { name: "Raka Pratama", email: "demo@uanglapangan.id", phoneNumber: "+6281234567890" };
  await db
    .insert(users)
    .values({ id: DEMO_USER_ID, ...demo })
    .onConflictDoUpdate({ target: users.id, set: demo });
  // Sandi akun demo (provider "credential" Better Auth), dibuat sekali.
  const [credential] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, DEMO_USER_ID), eq(accounts.providerId, "credential")));
  if (!credential) {
    await db.insert(accounts).values({
      userId: DEMO_USER_ID,
      providerId: "credential",
      accountId: DEMO_USER_ID,
      password: await hashPassword("lapangan123"),
    });
  }

  await db
    .insert(settings)
    .values({ id: "settings-demo", userId: DEMO_USER_ID })
    .onConflictDoNothing();

  if (withSamples) {
    await db
      .insert(projects)
      .values({
        id: "prj-contoh",
        userId: DEMO_USER_ID,
        name: "Pemetaan Batas Desa Sukamaju",
        client: "Dinas PUPR Kab. Garut",
        budget: 5_000_000,
        startDate: "2026-09-21",
        endDate: "2026-10-05",
      })
      .onConflictDoNothing();

    const base = { projectId: "prj-contoh", userId: DEMO_USER_ID } as const;
    await db
      .insert(transactions)
      .values([
        { ...base, id: "trx-contoh-1", categoryId: "cat-dana", type: "income", amount: 1_000_000, description: "Tambahan dana dari kantor", transactionDate: "2026-09-24" },
        { ...base, id: "trx-contoh-2", categoryId: "cat-transport", type: "expense", amount: 850_000, description: "Sewa mobil 2 hari", transactionDate: "2026-09-22" },
        { ...base, id: "trx-contoh-3", categoryId: "cat-penginapan", type: "expense", amount: 1_800_000, description: "Penginapan 4 malam", transactionDate: "2026-09-23" },
        { ...base, id: "trx-contoh-4", categoryId: "cat-konsumsi", type: "expense", amount: 725_000, description: "Makan tim 3 hari", transactionDate: "2026-09-25", noReceipt: true },
        { ...base, id: "trx-contoh-5", categoryId: "cat-lain", type: "expense", amount: 375_000, description: "Patok & cat tanda batas", transactionDate: "2026-09-26" },
      ])
      .onConflictDoNothing();

    // Foto struk contoh (file SVG di public/contoh-struk). Trigger mengisi has_receipt.
    await db
      .insert(receipts)
      .values([
        { id: "rcp-contoh-1", transactionId: "trx-contoh-2", fileUrl: "/contoh-struk/sewa-mobil.svg", fileName: "struk-sewa-mobil.jpg", mimeType: "image/svg+xml", sizeBytes: 1365, uploadedAt: "2026-09-22T09:14:00.000Z" },
        { id: "rcp-contoh-2", transactionId: "trx-contoh-3", fileUrl: "/contoh-struk/penginapan.svg", fileName: "nota-hotel.jpg", mimeType: "image/svg+xml", sizeBytes: 1457, uploadedAt: "2026-09-23T13:02:00.000Z" },
        { id: "rcp-contoh-3", transactionId: "trx-contoh-5", fileUrl: "/contoh-struk/patok-cat.svg", fileName: "nota-tb-makmur.jpg", mimeType: "image/svg+xml", sizeBytes: 1442, uploadedAt: "2026-09-26T07:45:00.000Z" },
      ])
      .onConflictDoNothing();

    // Proyek contoh lain (berjalan / selesai / arsip) untuk mencoba halaman Kelola Proyek.
    await db
      .insert(projects)
      .values([
        { id: "prj-cianjur", userId: DEMO_USER_ID, name: "Site Visit Tower BTS Cianjur", client: "PT Telko Nusantara", budget: 2_500_000, startDate: "2026-09-28", endDate: null, status: "aktif" },
        { id: "prj-sumedang", userId: DEMO_USER_ID, name: "Topografi Lahan Tol Sumedang", client: "PT Jasa Marga", budget: 8_000_000, startDate: "2026-08-04", endDate: "2026-08-22", status: "selesai" },
        { id: "prj-bandung", userId: DEMO_USER_ID, name: "Survei Drainase Kota Bandung", client: null, budget: 3_000_000, startDate: "2026-06-10", endDate: "2026-06-19", status: "arsip" },
      ])
      .onConflictDoNothing();

    // [id, proyek, tanggal, jenis, kategori, nominal, keterangan]
    const more: [string, string, string, "income" | "expense", string, number, string][] = [
      ["trx-cianjur-1", "prj-cianjur", "2026-09-28", "expense", "cat-transport", 650_000, "Travel Bandung–Cianjur PP"],
      ["trx-cianjur-2", "prj-cianjur", "2026-09-28", "expense", "cat-penginapan", 600_000, "Losmen 2 malam"],
      ["trx-cianjur-3", "prj-cianjur", "2026-09-29", "expense", "cat-konsumsi", 320_000, "Makan 2 hari"],
      ["trx-cianjur-4", "prj-cianjur", "2026-09-30", "expense", "cat-peralatan", 280_000, "Sewa tangga & tali"],
      ["trx-sumedang-1", "prj-sumedang", "2026-08-04", "expense", "cat-transport", 1_200_000, "Sewa mobil + sopir"],
      ["trx-sumedang-2", "prj-sumedang", "2026-08-05", "expense", "cat-peralatan", 2_400_000, "Sewa total station 10 hari"],
      ["trx-sumedang-3", "prj-sumedang", "2026-08-06", "expense", "cat-penginapan", 3_150_000, "Mess pekerja 18 malam"],
      ["trx-sumedang-4", "prj-sumedang", "2026-08-12", "income", "cat-dana", 1_500_000, "Tambahan dana minggu kedua"],
      ["trx-sumedang-5", "prj-sumedang", "2026-08-15", "expense", "cat-konsumsi", 1_620_000, "Konsumsi tim 18 hari"],
      ["trx-sumedang-6", "prj-sumedang", "2026-08-21", "expense", "cat-lain", 750_000, "Upah pembantu lapangan"],
      ["trx-bandung-1", "prj-bandung", "2026-06-10", "expense", "cat-transport", 900_000, "Transport harian"],
      ["trx-bandung-2", "prj-bandung", "2026-06-12", "expense", "cat-konsumsi", 1_100_000, "Konsumsi 10 hari"],
      ["trx-bandung-3", "prj-bandung", "2026-06-18", "expense", "cat-peralatan", 1_000_000, "Beli meteran & rompi"],
    ];
    await db
      .insert(transactions)
      .values(
        more.map(([id, projectId, transactionDate, type, categoryId, amount, description]) => ({
          id, projectId, userId: DEMO_USER_ID, transactionDate, type, categoryId, amount, description,
        })),
      )
      .onConflictDoNothing();

    // Riwayat backup contoh (metadata saja — arsipnya tidak benar-benar ada di Drive).
    const drive = "Google Drive tidak bisa dihubungi (koneksi terputus).";
    const expired = "Izin Google Drive kedaluwarsa — perlu dihubungkan ulang.";
    // [tanggal file, ukuran, proyek, transaksi, galat?]
    const history: [string, number, number, number, string?][] = [
      ["2026-10-01", 48_213, 4, 26],
      ["2026-09-30", 47_901, 4, 24],
      ["2026-09-29", 0, 0, 0, drive],
      ["2026-09-28", 46_120, 4, 21],
      ["2026-09-27", 45_874, 4, 20],
      ["2026-09-26", 44_310, 4, 18],
      ["2026-09-25", 43_962, 4, 17],
      ["2026-09-24", 0, 0, 0, expired],
      ["2026-09-23", 42_007, 3, 14],
      ["2026-09-22", 41_385, 3, 12],
    ];
    await db
      .insert(backupArchives)
      .values(
        history.map(([day, sizeBytes, projectCount, transactionCount, error]) => {
          // Jadwal harian 02.00 WIB = 19.00 UTC hari sebelumnya.
          const started = new Date(`${day}T02:00:00+07:00`);
          return {
            id: `bk-contoh-${day}`,
            userId: DEMO_USER_ID,
            trigger: "terjadwal" as const,
            status: error ? ("gagal" as const) : ("berhasil" as const),
            fileName: `uanglapangan-${day}.zip`,
            sizeBytes,
            projectCount,
            transactionCount,
            error: error ?? null,
            // Arsip contoh dianggap ada di Drive (id tiruan) agar riwayat terlihat seperti aslinya.
            driveFileId: error ? null : `contoh-drive-${day}`,
            createdAt: started.toISOString(),
            completedAt: new Date(started.getTime() + 40_000).toISOString(),
          };
        }),
      )
      .onConflictDoNothing();

    // Drive mode simulasi agar alur backup bisa dicoba tanpa akun Google.
    await db
      .insert(driveConnections)
      .values({ userId: DEMO_USER_ID, mode: "simulasi", accountEmail: "simulasi (tanpa Google)" })
      .onConflictDoNothing();

    // Jadikan proyek contoh sebagai proyek aktif bila belum ada yang aktif.
    await db
      .update(settings)
      .set({ activeProjectId: "prj-contoh" })
      .where(and(eq(settings.userId, DEMO_USER_ID), isNull(settings.activeProjectId)));
  }

  console.log(`✓ Seed selesai${withSamples ? " (dengan data contoh)" : ""}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
