import { getCurrentUserId } from "@/server/current-user";
import { isStoredKey, readReceiptFile } from "@/server/receipt-storage";
import { getOwnedReceipt } from "@/server/receipts";

/**
 * GET /api/receipts/:id/file — isi foto bukti, hanya untuk pemilik transaksinya.
 * Foto tidak pernah berubah setelah diunggah, jadi boleh di-cache lama di perangkat (privat).
 * 200 gambar · 404 tidak ditemukan
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/receipts/[id]/file">) {
  const notFound = () => new Response("Foto tidak ditemukan.", { status: 404 });
  try {
    const { id } = await ctx.params;
    const receipt = await getOwnedReceipt(await getCurrentUserId(), id);
    // Foto contoh (seed) bukan unggahan — dilayani langsung dari /contoh-struk/.
    if (!receipt || !isStoredKey(receipt.fileUrl)) return notFound();
    const bytes = await readReceiptFile(receipt.fileUrl);
    if (!bytes) return notFound();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": receipt.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        // Hanya untuk ditampilkan di aplikasi ini: tidak bisa disematkan situs lain, dan bila
        // dibuka langsung tidak boleh menjalankan apa pun.
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(receipt.fileName)}`,
      },
    });
  } catch (error) {
    console.error("GET /api/receipts/[id]/file gagal:", error);
    return new Response("Gagal memuat foto.", { status: 500 });
  }
}
