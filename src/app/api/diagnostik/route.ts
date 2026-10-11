import { and, desc, eq, isNull, sql, TransactionRollbackError } from "drizzle-orm";

import { db } from "@/db";
import { receipts, transactions } from "@/db/schema";
import { getCurrentUserId } from "@/server/current-user";
import { googleOAuthConfig } from "@/server/google-oauth";
import { mailerConfigured } from "@/server/mailer";
import { checkStorage } from "@/server/object-storage";
import { deleteReceiptFile, readReceiptFile, receiptKey, saveReceiptFile } from "@/server/receipt-storage";
import { whatsappConfigured } from "@/server/whatsapp";

const noStore = { "Cache-Control": "no-store" };

const describe = (error: unknown) => {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` ← ${error.cause.message}` : "";
  return `${error.name}: ${error.message.replace(/\s+/g, " ").slice(0, 200)}${cause}`.slice(0, 400);
};

/** JPEG 1x1 piksel yang sah (untuk uji unggah). */
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);

/**
 * Uji jalur simpan foto struk langkah demi langkah, tanpa meninggalkan data:
 * 1) unggah gambar ke penyimpanan dengan kunci seperti foto struk, 2) baca lagi, 3) simpan baris
 * `receipts` untuk catatan terakhir pengguna di dalam transaksi database yang DIBATALKAN, 4) hapus berkas.
 */
async function checkReceiptPath(userId: string) {
  const steps: Record<string, string> = {};
  const [tx] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.createdAt))
    .limit(1);
  if (!tx) return { ok: false, langkah: { catatan: "Belum ada catatan — buat satu catatan dulu lalu buka halaman ini lagi." } };

  const receiptId = crypto.randomUUID();
  const key = receiptKey(tx.id, receiptId, "image/jpeg");
  try {
    await saveReceiptFile(key, TINY_JPEG);
    steps.unggah = "ok";
  } catch (error) {
    steps.unggah = describe(error);
    return { ok: false, langkah: steps };
  }
  try {
    const back = await readReceiptFile(key);
    steps.baca = back && back.length === TINY_JPEG.length ? "ok" : `isi tidak sama (${back?.length ?? "kosong"} byte)`;
  } catch (error) {
    steps.baca = describe(error);
  }
  try {
    await db.transaction(async (trx) => {
      await trx.insert(receipts).values({
        id: receiptId,
        transactionId: tx.id,
        fileUrl: key,
        fileName: "diagnostik.jpg",
        mimeType: "image/jpeg",
        sizeBytes: TINY_JPEG.length,
      });
      trx.rollback();
    });
    steps.database = "ok";
  } catch (error) {
    steps.database = error instanceof TransactionRollbackError ? "ok" : describe(error);
  }
  try {
    await deleteReceiptFile(key);
    steps.hapus = "ok";
  } catch (error) {
    steps.hapus = describe(error);
  }
  return { ok: Object.values(steps).every((v) => v === "ok"), langkah: steps };
}

/**
 * GET /api/diagnostik — pemeriksaan cepat konfigurasi server untuk pengguna yang sudah masuk:
 * database, penyimpanan berkas (uji tulis-baca-hapus), dan layanan opsional. Hanya status &
 * pesan galat — tidak pernah menampilkan nilai rahasia.
 * 200 { data: { database, penyimpanan, googleDrive, email, whatsapp, saran[] } } · 401 belum masuk
 */
export async function GET() {
  const userId = await getCurrentUserId();
  const [storage, database] = await Promise.all([
    checkStorage(),
    db
      .get<{ n: number }>(sql`select count(*) as n from categories`)
      .then((r) => ({ ok: true as const, kategori: Number(r?.n ?? 0) }))
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })),
  ]);

  const foto = await checkReceiptPath(userId);

  const r2Vars = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
  const r2Missing = r2Vars.filter((k) => !process.env[k]);
  const saran: string[] = [];
  if (storage.driver === "local" && process.env.VERCEL) {
    saran.push(
      `Penyimpanan masih memakai folder server — di Vercel foto TIDAK bisa disimpan. Variabel yang belum terbaca: ${r2Missing.join(", ") || "-"}. Isi di Vercel → Settings → Environment Variables (lingkungan Production), lalu Redeploy.`,
    );
  }
  if (storage.driver === "r2" && !storage.ok) {
    const e = storage.error ?? "";
    if (/403|AccessDenied|SignatureDoesNotMatch|InvalidAccessKeyId/i.test(e)) {
      saran.push("R2 menolak kunci: periksa R2_ACCESS_KEY_ID & R2_SECRET_ACCESS_KEY (tanpa spasi), dan token harus berizin Object Read & Write untuk bucket ini.");
    } else if (/404|NoSuchBucket/i.test(e)) {
      saran.push("Bucket tidak ditemukan: periksa R2_BUCKET (nama persis) dan R2_ACCOUNT_ID.");
    } else if (/fetch failed|ENOTFOUND|getaddrinfo/i.test(e)) {
      saran.push("Alamat R2 tidak bisa dihubungi: R2_ACCOUNT_ID kemungkinan salah (32 karakter heksadesimal dari dasbor R2).");
    }
  }
  if (database.ok && database.kategori === 0) saran.push("Kategori bawaan belum ada: jalankan npm run db:seed -- --hanya-kategori ke database ini.");

  return Response.json(
    {
      data: {
        database,
        penyimpanan: storage,
        simpanFoto: foto,
        googleDrive: googleOAuthConfig() ? "terkonfigurasi" : "belum (boleh menyusul)",
        email: mailerConfigured() ? "terkonfigurasi" : "belum (boleh menyusul)",
        whatsapp: whatsappConfigured() ? "terkonfigurasi" : "belum (boleh menyusul)",
        saran,
      },
    },
    { headers: noStore },
  );
}
