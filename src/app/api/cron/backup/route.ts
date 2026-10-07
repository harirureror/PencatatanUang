import { runDueBackups } from "@/server/backup-runner";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/cron/backup — jalankan backup terjadwal yang jatuh tempo (dipanggil Vercel Cron
 * tiap hari 19.00 UTC = 02.00 WIB, lihat vercel.json). Aman dipanggil berulang.
 * Wajib header Authorization: Bearer <CRON_SECRET> (Vercel Cron mengirimnya otomatis bila
 * env CRON_SECRET diisi). Di mode dev tanpa CRON_SECRET boleh dipanggil langsung.
 * 200 { data: { checked, started: [{ id, status }], skipped } } · 401 · 503 belum dikonfigurasi
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return Response.json({ error: "CRON_SECRET belum diisi." }, { status: 503, headers: noStore });
  }
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Tidak diizinkan." }, { status: 401, headers: noStore });
  }

  try {
    const report = await runDueBackups();
    return Response.json(
      {
        data: {
          checked: report.checked,
          skipped: report.skipped,
          started: report.started.map(({ id, status, error }) => ({ id, status, error })),
        },
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("GET /api/cron/backup gagal:", error);
    return Response.json({ error: "Gagal menjalankan backup terjadwal." }, { status: 500, headers: noStore });
  }
}
