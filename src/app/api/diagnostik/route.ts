import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getCurrentUserId } from "@/server/current-user";
import { googleOAuthConfig } from "@/server/google-oauth";
import { mailerConfigured } from "@/server/mailer";
import { checkStorage } from "@/server/object-storage";
import { whatsappConfigured } from "@/server/whatsapp";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/diagnostik — pemeriksaan cepat konfigurasi server untuk pengguna yang sudah masuk:
 * database, penyimpanan berkas (uji tulis-baca-hapus), dan layanan opsional. Hanya status &
 * pesan galat — tidak pernah menampilkan nilai rahasia.
 * 200 { data: { database, penyimpanan, googleDrive, email, whatsapp, saran[] } } · 401 belum masuk
 */
export async function GET() {
  await getCurrentUserId();
  const [storage, database] = await Promise.all([
    checkStorage(),
    db
      .get<{ n: number }>(sql`select count(*) as n from categories`)
      .then((r) => ({ ok: true as const, kategori: Number(r?.n ?? 0) }))
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })),
  ]);

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
        googleDrive: googleOAuthConfig() ? "terkonfigurasi" : "belum (boleh menyusul)",
        email: mailerConfigured() ? "terkonfigurasi" : "belum (boleh menyusul)",
        whatsapp: whatsappConfigured() ? "terkonfigurasi" : "belum (boleh menyusul)",
        saran,
      },
    },
    { headers: noStore },
  );
}
