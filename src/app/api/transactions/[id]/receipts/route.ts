import { getCurrentUserId } from "@/server/current-user";
import { readReceiptFiles } from "@/server/receipt-files";
import { addReceipts, listReceipts, ReceiptRejectedError } from "@/server/receipts";

const noStore = { "Cache-Control": "no-store" };
const notFound = () =>
  Response.json({ error: "Catatan tidak ditemukan." }, { status: 404, headers: noStore });

/**
 * GET /api/transactions/:id/receipts — daftar foto bukti satu transaksi.
 * 200 { data: Receipt[] } · 404 transaksi tidak ditemukan
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/transactions/[id]/receipts">) {
  try {
    const { id } = await ctx.params;
    const data = await listReceipts(await getCurrentUserId(), id);
    if (!data) return notFound();
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/transactions/[id]/receipts gagal:", error);
    return Response.json({ error: "Gagal memuat lampiran." }, { status: 500, headers: noStore });
  }
}

/**
 * POST /api/transactions/:id/receipts — unggah foto bukti (multipart/form-data, field
 * "receipts", boleh lebih dari satu). Foto dikompres di perangkat sebelum dikirim.
 * Isi file diperiksa (JPG/PNG/WEBP/HEIC), total ≤ 4 MB, maksimal 10 foto per transaksi.
 * 201 { data: Receipt[] } · 400 { error } · 404 transaksi tidak ditemukan
 */
export async function POST(request: Request, ctx: RouteContext<"/api/transactions/[id]/receipts">) {
  const badRequest = (error: string) =>
    Response.json({ error }, { status: 400, headers: noStore });
  try {
    const { id } = await ctx.params;
    const userId = await getCurrentUserId();

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return badRequest("Kirim foto sebagai multipart/form-data dengan field \"receipts\".");
    }

    const picked = readReceiptFiles(formData); // batas jumlah per transaksi dicek addReceipts
    if ("error" in picked) return badRequest(picked.error);
    if (picked.files.length === 0) return badRequest("Pilih minimal satu foto struk.");

    const data = await addReceipts(userId, id, picked.files);
    if (!data) return notFound();
    return Response.json({ data }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof ReceiptRejectedError) return badRequest(error.message);
    console.error("POST /api/transactions/[id]/receipts gagal:", error);
    return Response.json({ error: "Gagal menyimpan foto struk." }, { status: 500, headers: noStore });
  }
}
