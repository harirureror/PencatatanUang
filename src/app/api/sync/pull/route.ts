import {
  DEFAULT_PULL_LIMIT,
  DeviceRejectedError,
  MAX_PULL_LIMIT,
  parseDevice,
  resolveSyncAuth,
  pullChanges,
} from "@/server/sync";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/sync/pull?since=<rev>&limit=<n> — perubahan sejak kursor perangkat.
 * Header: Authorization: Bearer <token sinkron> (atau sesi login), X-Device-Id (UUID, wajib), X-Device-Label, X-Device-Platform (web|android|desktop).
 * Mengembalikan baris projects, categories, transactions, receipts, settings yang berubah —
 * termasuk yang terhapus (deletedAt terisi) — beserta rev & updatedAt.
 * Ulangi dengan `since = cursor` selama `hasMore` true. since=0 → tarik semua data.
 * 200 { data: { cursor, hasMore, changes } } · 400 query/header salah · 401 token kedaluwarsa/tidak valid (code) · 403 perangkat ditolak
 */
export async function GET(request: Request) {
  const device = parseDevice(request);
  if ("error" in device) return Response.json({ error: device.error }, { status: 400, headers: noStore });

  const params = new URL(request.url).searchParams;
  const since = Number(params.get("since") ?? "0");
  const limit = Number(params.get("limit") ?? DEFAULT_PULL_LIMIT);
  if (!Number.isSafeInteger(since) || since < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PULL_LIMIT) {
    return Response.json(
      { error: `Query tidak valid: since = bilangan bulat ≥ 0, limit = 1–${MAX_PULL_LIMIT}.` },
      { status: 400, headers: noStore },
    );
  }

  try {
    const auth = await resolveSyncAuth(request, device);
    if ("error" in auth) {
      return Response.json({ error: auth.error, code: auth.code }, { status: 401, headers: noStore });
    }
    const data = await pullChanges(auth.userId, device, since, limit);
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    if (error instanceof DeviceRejectedError) {
      return Response.json({ error: error.message }, { status: 403, headers: noStore });
    }
    console.error("GET /api/sync/pull gagal:", error);
    return Response.json({ error: "Gagal menarik perubahan." }, { status: 500, headers: noStore });
  }
}
