import { getCurrentUserId } from "@/server/current-user";
import { readReceiptFiles } from "@/server/receipt-files";
import { deleteReceipt, ReceiptRejectedError, replaceReceipt } from "@/server/receipts";

const noStore = { "Cache-Control": "no-store" };
const notFound = () =>
  Response.json({ error: "Foto tidak ditemukan. Mungkin sudah dihapus." }, { status: 404, headers: noStore });

/** Pesan galat singkat beserta penyebabnya (tanpa nilai rahasia), untuk dilaporkan. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` ← ${error.cause.message}` : "";
  return `${error.name}: ${error.message.replace(/\s+/g, " ").slice(0, 160)}${cause}`.slice(0, 300);
}

/**
 * DELETE /api/receipts/:id — hapus satu foto bukti; catatannya tetap ada.
 * 200 { data: { id } } · 404 tidak ditemukan
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/receipts/[id]">) {
  try {
    const { id } = await ctx.params;
    if (!(await deleteReceipt(await getCurrentUserId(), id))) return notFound();
    return Response.json({ data: { id } }, { headers: noStore });
  } catch (error) {
    console.error("DELETE /api/receipts/[id] gagal:", error);
    return Response.json({ error: "Gagal menghapus foto.", detail: describe(error) }, { status: 500, headers: noStore });
  }
}

/**
 * PUT /api/receipts/:id — ganti foto bukti dengan foto baru (multipart/form-data, field
 * "receipts", tepat satu foto). Foto lama dihapus; jumlah foto catatan tidak berubah.
 * 200 { data: Receipt } · 400 { error } · 404 tidak ditemukan
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/receipts/[id]">) {
  const badRequest = (error: string) => Response.json({ error }, { status: 400, headers: noStore });
  try {
    const { id } = await ctx.params;
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return badRequest("Kirim foto sebagai multipart/form-data dengan field \"receipts\".");
    }
    const picked = readReceiptFiles(formData);
    if ("error" in picked) return badRequest(picked.error);
    if (picked.files.length !== 1) return badRequest("Pilih tepat satu foto pengganti.");

    const data = await replaceReceipt(await getCurrentUserId(), id, picked.files[0]);
    if (!data) return notFound();
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    if (error instanceof ReceiptRejectedError) return badRequest(error.message);
    console.error("PUT /api/receipts/[id] gagal:", error);
    return Response.json({ error: "Gagal mengganti foto.", detail: describe(error) }, { status: 500, headers: noStore });
  }
}
