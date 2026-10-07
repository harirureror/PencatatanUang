import { getCurrentUserId } from "@/server/current-user";
import { setNoReceipt } from "@/server/receipts";

const noStore = { "Cache-Control": "no-store" };

/**
 * PUT /api/transactions/:id/no-receipt — tandai / lepas status "tanpa struk".
 * Body JSON { noReceipt: boolean }. Tanda otomatis lepas saat foto pertama ditambahkan.
 * 200 { data: { noReceipt, hasReceipt } } · 400 body salah · 404 tidak ditemukan
 * · 409 transaksi sudah punya foto bukti (tidak bisa ditandai tanpa struk)
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/transactions/[id]/no-receipt">) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON." }, { status: 400, headers: noStore });
  }
  const flagged = (body as { noReceipt?: unknown } | null)?.noReceipt;
  if (typeof flagged !== "boolean") {
    return Response.json(
      { error: "Isi noReceipt dengan true atau false." },
      { status: 400, headers: noStore },
    );
  }

  try {
    const { id } = await ctx.params;
    const data = await setNoReceipt(await getCurrentUserId(), id, flagged);
    if (!data) {
      return Response.json({ error: "Catatan tidak ditemukan." }, { status: 404, headers: noStore });
    }
    if (flagged && !data.noReceipt) {
      return Response.json(
        { error: "Transaksi ini sudah punya foto bukti, jadi tidak bisa ditandai tanpa struk.", data },
        { status: 409, headers: noStore },
      );
    }
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("PUT /api/transactions/[id]/no-receipt gagal:", error);
    return Response.json({ error: "Gagal menyimpan tanda." }, { status: 500, headers: noStore });
  }
}
