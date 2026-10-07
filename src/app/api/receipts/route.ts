import { getCurrentUserId } from "@/server/current-user";
import { getReceiptsByTransaction, MAX_RECEIPT_LOOKUP_IDS } from "@/server/receipts";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/receipts?transactionIds=a,b,c — lampiran banyak transaksi sekaligus (untuk daftar).
 * Transaksi yang tidak punya foto atau bukan milik pengguna tidak muncul di hasil.
 * 200 { data: Record<transactionId, Receipt[]> } · 400 id kosong / terlalu banyak
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("transactionIds") ?? "";
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return Response.json(
      { error: "Isi transactionIds dengan id transaksi, dipisah koma." },
      { status: 400, headers: noStore },
    );
  }
  if (ids.length > MAX_RECEIPT_LOOKUP_IDS) {
    return Response.json(
      { error: `Maksimal ${MAX_RECEIPT_LOOKUP_IDS} transaksi sekali minta.` },
      { status: 400, headers: noStore },
    );
  }
  try {
    const data = await getReceiptsByTransaction(await getCurrentUserId(), ids);
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/receipts gagal:", error);
    return Response.json({ error: "Gagal memuat lampiran." }, { status: 500, headers: noStore });
  }
}
