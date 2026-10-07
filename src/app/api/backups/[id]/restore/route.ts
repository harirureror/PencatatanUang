import { RESTORE_CONFIRM_WORD } from "@/lib/backup";
import { RestoreError, restoreFromArchive } from "@/server/backup-restore";
import { getCurrentUserId } from "@/server/current-user";

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/backups/:id/restore — pulihkan data dari arsip.
 * Body JSON: { confirm: "PULIHKAN", backupFirst?: boolean (default true) }
 * Arsip diperiksa (checksum, isi, pemilik) sebelum apa pun diubah; data diganti dalam satu
 * transaksi — baris yang tidak ada di arsip ditandai terhapus agar perangkat lain ikut.
 * 200 { data: { archiveId, fileName, restored, removed, safetyBackup } }
 * 400 konfirmasi salah · 422 { error } arsip tidak bisa dipakai / bentrok / backup pengaman gagal
 */
export async function POST(request: Request, ctx: RouteContext<"/api/backups/[id]/restore">) {
  let body: { confirm?: unknown; backupFirst?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return Response.json({ error: "Body harus berupa JSON." }, { status: 400, headers: noStore });
  }
  if (String(body.confirm ?? "").trim().toUpperCase() !== RESTORE_CONFIRM_WORD) {
    return Response.json(
      { error: `Isi confirm dengan "${RESTORE_CONFIRM_WORD}" untuk melanjutkan.` },
      { status: 400, headers: noStore },
    );
  }
  if (body.backupFirst !== undefined && typeof body.backupFirst !== "boolean") {
    return Response.json({ error: "backupFirst harus true atau false." }, { status: 400, headers: noStore });
  }

  try {
    const { id } = await ctx.params;
    const data = await restoreFromArchive(await getCurrentUserId(), id, {
      backupFirst: body.backupFirst !== false,
    });
    return Response.json({ data }, { headers: noStore });
  } catch (error) {
    if (error instanceof RestoreError) {
      return Response.json({ error: error.message }, { status: 422, headers: noStore });
    }
    console.error("POST /api/backups/[id]/restore gagal:", error);
    return Response.json({ error: "Pemulihan gagal — data tidak diubah." }, { status: 500, headers: noStore });
  }
}
