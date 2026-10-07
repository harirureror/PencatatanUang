import { countTransactionsByCategory, createCategoryChecked, listCategories } from "@/server/categories";
import { getCurrentUserId } from "@/server/current-user";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/categories?jenis=pengeluaran|pemasukan — kategori bawaan + buatan pengguna (belum
 * dihapus), urut tampilan, beserta jumlah catatan yang memakainya.
 * 200 { data: { categories: (Category & { usedCount })[] } } · 400 jenis salah
 */
export async function GET(request: Request) {
  const jenis = new URL(request.url).searchParams.get("jenis");
  if (jenis !== null && jenis !== "pengeluaran" && jenis !== "pemasukan") {
    return Response.json({ error: "jenis harus pengeluaran atau pemasukan." }, { status: 400, headers: noStore });
  }
  try {
    const userId = await getCurrentUserId();
    const type = jenis === "pemasukan" ? "income" : jenis === "pengeluaran" ? "expense" : undefined;
    const [list, usage] = await Promise.all([listCategories(userId, type), countTransactionsByCategory(userId)]);
    const categories = list.map((c) => ({ ...c, usedCount: usage.get(c.id) ?? 0 }));
    return Response.json({ data: { categories } }, { headers: noStore });
  } catch (error) {
    console.error("GET /api/categories gagal:", error);
    return Response.json({ error: "Gagal memuat kategori." }, { status: 500, headers: noStore });
  }
}

/**
 * POST /api/categories — tambah kategori buatan sendiri.
 * Body JSON: { name, type: "income"|"expense" }
 * 201 { data: { category } } · 400 body bukan JSON · 409 nama sudah ada · 422 isian tidak valid
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400, headers: noStore });
  }
  try {
    const result = await createCategoryChecked(await getCurrentUserId(), { name: body.name, type: body.type });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers: noStore });
    return Response.json({ data: { category: result.category } }, { status: 201, headers: noStore });
  } catch (error) {
    console.error("POST /api/categories gagal:", error);
    return Response.json({ error: "Gagal menambah kategori." }, { status: 500, headers: noStore });
  }
}
