import { getCurrentUserId } from "@/server/current-user";
import { DeviceRejectedError, parseDevice, touchDevice } from "@/server/sync";
import { issueSyncToken, SYNC_TOKEN_TTL_SECONDS, SyncTokenConfigError } from "@/server/sync-token";

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/sync/token — tukar sesi login menjadi token sinkron berumur pendek untuk satu
 * perangkat. Token dipakai sebagai `Authorization: Bearer …` di /api/sync/pull & push, berlaku
 * 15 menit; minta lagi saat kedaluwarsa (401 code "token_expired"). Kunci database pusat
 * (Turso) tidak pernah dikirim ke perangkat.
 * Header: X-Device-Id (UUID, wajib), X-Device-Label, X-Device-Platform (web|android|desktop).
 * 200 { data: { token, expiresAt, ttlSeconds } } · 400 header salah · 403 perangkat dicabut /
 * milik akun lain · 500 server belum dikonfigurasi
 */
export async function POST(request: Request) {
  const device = parseDevice(request);
  if ("error" in device) return Response.json({ error: device.error }, { status: 400, headers: noStore });

  try {
    const userId = await getCurrentUserId();
    await touchDevice(userId, device);
    const { token, expiresAt } = issueSyncToken(userId, device.id);
    return Response.json(
      { data: { token, expiresAt, ttlSeconds: SYNC_TOKEN_TTL_SECONDS } },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof DeviceRejectedError) {
      return Response.json({ error: error.message }, { status: 403, headers: noStore });
    }
    if (error instanceof SyncTokenConfigError) {
      console.error("POST /api/sync/token:", error.message);
      return Response.json(
        { error: "Sinkronisasi belum dikonfigurasi di server." },
        { status: 500, headers: noStore },
      );
    }
    console.error("POST /api/sync/token gagal:", error);
    return Response.json({ error: "Gagal menerbitkan token sinkron." }, { status: 500, headers: noStore });
  }
}
