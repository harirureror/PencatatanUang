import { getCurrentUserId } from "@/server/current-user";
import { applyDelete, applyUpdate } from "@/server/transaction-ops";
import { getTransaction } from "@/server/transactions";

const noStore = { "Cache-Control": "no-store" };
const notFound = () =>
  Response.json({ error: "Catatan tidak ditemukan." }, { status: 404, headers: noStore });

/**
 * GET /api/transactions/:id — detail satu transaksi milik pengguna.
 * 200 { data: Transaction } · 404 tidak ditemukan
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  try {
    const { id } = await ctx.params;
    const data = await getTransaction(await getCurrentUserId(), id);
    if (!data) return notFound();
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/transactions/[id] gagal:", error);
    return Response.json({ error: "Gagal memuat catatan." }, { status: 500, headers: noStore });
  }
}

/**
 * DELETE /api/transactions/:id — hapus catatan; saldo otomatis dihitung ulang.
 * 200 { data: { id } } · 404 tidak ditemukan
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  try {
    const { id } = await ctx.params;
    const result = await applyDelete(await getCurrentUserId(), id);
    if (result.status !== "applied") return notFound();
    return Response.json({ data: { id } }, { headers: noStore });
  } catch (error) {
    console.error("DELETE /api/transactions/[id] gagal:", error);
    return Response.json({ error: "Gagal menghapus catatan." }, { status: 500, headers: noStore });
  }
}

/**
 * PATCH /api/transactions/:id — ubah sebagian isi catatan.
 * Body JSON (semua opsional): { amount, categoryId, transactionDate, description, base?, editedAt?, sentAt? }
 * `base` = isi catatan saat mulai diubah di perangkat (offline). Bila isi di server sudah
 * berbeda → last-write-wins: `editedAt` (waktu diubah di perangkat; `sentAt` = jam perangkat
 * saat mengirim, untuk koreksi jam) lebih baru dari versi server → diterapkan
 * (200, resolution "device-wins"); selain itu 409 { conflict: true, resolution: "server-wins",
 * data: versi server }.
 * Jenis (income/expense) tidak bisa diubah — hapus lalu catat ulang bila salah jenis.
 * 200 { data: Transaction } · 400 body tidak valid · 404 tidak ditemukan · 409 bentrok
 * 422 { error, fieldErrors }
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/transactions/[id]">) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON." }, { status: 400, headers: noStore });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Body harus berupa objek JSON." }, { status: 400, headers: noStore });
  }

  try {
    const { id } = await ctx.params;
    const result = await applyUpdate(await getCurrentUserId(), id, body as Record<string, unknown>);
    switch (result.status) {
      case "applied":
        return Response.json(
          result.resolution ? { data: result.data, resolution: result.resolution } : { data: result.data },
          { headers: noStore },
        );
      case "conflict":
        return Response.json(
          { error: result.error, conflict: true, resolution: result.resolution, data: result.data },
          { status: 409, headers: noStore },
        );
      case "invalid":
        return Response.json(
          { error: result.error, fieldErrors: result.fieldErrors },
          { status: result.http, headers: noStore },
        );
      default:
        return notFound();
    }
  } catch (error) {
    console.error("PATCH /api/transactions/[id] gagal:", error);
    return Response.json({ error: "Gagal menyimpan perubahan." }, { status: 500, headers: noStore });
  }
}
