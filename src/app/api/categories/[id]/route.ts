import { deleteCategoryChecked, renameCategoryChecked } from "@/server/categories";
import { getCurrentUserId } from "@/server/current-user";

const noStore = { "Cache-Control": "no-store" };

/**
 * PATCH /api/categories/:id — ganti nama kategori buatan sendiri.
 * Body JSON: { name }
 * 200 { data: { category } } · 404 tidak ditemukan / milik orang lain · 409 nama sudah ada
 * 422 kosong / terlalu panjang / kategori bawaan
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/categories/[id]">) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus JSON." }, { status: 400, headers: noStore });
  }
  try {
    const { id } = await ctx.params;
    const result = await renameCategoryChecked(await getCurrentUserId(), id, body.name);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers: noStore });
    return Response.json({ data: { category: result.category } }, { headers: noStore });
  } catch (error) {
    console.error("PATCH /api/categories/[id] gagal:", error);
    return Response.json({ error: "Gagal mengubah kategori." }, { status: 500, headers: noStore });
  }
}

/**
 * DELETE /api/categories/:id — hapus kategori buatan sendiri (soft delete agar tersinkron).
 * 200 { data: { id } } · 404 tidak ditemukan · 409 masih dipakai catatan · 422 kategori bawaan
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/categories/[id]">) {
  try {
    const { id } = await ctx.params;
    const result = await deleteCategoryChecked(await getCurrentUserId(), id);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers: noStore });
    return Response.json({ data: { id: result.category.id } }, { headers: noStore });
  } catch (error) {
    console.error("DELETE /api/categories/[id] gagal:", error);
    return Response.json({ error: "Gagal menghapus kategori." }, { status: 500, headers: noStore });
  }
}
