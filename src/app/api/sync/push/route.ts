import {
  DeviceRejectedError,
  MAX_PUSH_OPS,
  parseDevice,
  resolveSyncAuth,
  parsePushOp,
  pushChanges,
  type PushOp,
} from "@/server/sync";

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/sync/push — kirim antrean perubahan perangkat sekaligus (urut sesuai antrean).
 * Header: Authorization: Bearer <token sinkron> (atau sesi login), X-Device-Id (UUID, wajib), X-Device-Label, X-Device-Platform.
 * Body JSON: { sentAt?: jam perangkat saat mengirim (ISO), ops: [
 *   { opId, kind: "create", tx: { id, projectId?, type, amount, categoryId, transactionDate, description?, noReceipt? } },
 *   { opId, kind: "update", txId, changes: { amount?, categoryId?, transactionDate?, description? }, base?, editedAt? },
 *   { opId, kind: "delete", txId }
 * ] }  (maks 200)
 * Hasil per perubahan (urutan sama):
 *   applied (data, replayed?, resolution?) · invalid (error, fieldErrors)
 *   · conflict (resolution "server-wins", data = versi server — last-write-wins, lihat PATCH)
 *   · unavailable (coba lagi nanti) · not_found (catatan sudah dihapus di perangkat lain)
 * Lalu tarik perubahan dengan GET /api/sync/pull.
 * 200 { data: { results } } · 400 body salah · 401 token kedaluwarsa/tidak valid (code) · 403 perangkat ditolak
 */
export async function POST(request: Request) {
  const device = parseDevice(request);
  if ("error" in device) return Response.json({ error: device.error }, { status: 400, headers: noStore });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON." }, { status: 400, headers: noStore });
  }
  const rawOps = (body as { ops?: unknown } | null)?.ops;
  if (!Array.isArray(rawOps) || rawOps.length === 0 || rawOps.length > MAX_PUSH_OPS) {
    return Response.json(
      { error: `Isi "ops" dengan 1–${MAX_PUSH_OPS} perubahan.` },
      { status: 400, headers: noStore },
    );
  }
  const ops = rawOps.map(parsePushOp);
  const bad = ops.findIndex((op) => op === null);
  if (bad >= 0) {
    return Response.json(
      { error: `Perubahan ke-${bad + 1} tidak valid (butuh opId dan kind create/update/delete beserta isinya).` },
      { status: 400, headers: noStore },
    );
  }

  try {
    const sentAt = (body as { sentAt?: unknown }).sentAt;
    const auth = await resolveSyncAuth(request, device);
    if ("error" in auth) {
      return Response.json({ error: auth.error, code: auth.code }, { status: 401, headers: noStore });
    }
    const results = await pushChanges(
      auth.userId,
      device,
      ops as PushOp[],
      typeof sentAt === "string" ? sentAt : undefined,
    );
    return Response.json({ data: { results } }, { headers: noStore });
  } catch (error) {
    if (error instanceof DeviceRejectedError) {
      return Response.json({ error: error.message }, { status: 403, headers: noStore });
    }
    console.error("POST /api/sync/push gagal:", error);
    return Response.json({ error: "Gagal mengirim perubahan." }, { status: 500, headers: noStore });
  }
}
