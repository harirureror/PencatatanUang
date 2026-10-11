import { sql } from "drizzle-orm";
import { Copy } from "lucide-react";

import { db } from "@/db";
import { mirrorOf } from "@/lib/mirror";

/** Waktu penyalinan terakhir (ditulis scripts/salin-data.mjs), atau null bila belum pernah. */
async function lastCopiedAt(): Promise<Date | null> {
  try {
    const row = await db.get<{ copied_at: string }>(sql`select copied_at from _mirror_meta where id = 1`);
    return row ? new Date(row.copied_at) : null;
  } catch {
    return null; // tabel belum ada: penyalinan pertama belum dijalankan
  }
}

const formatTime = (date: Date) =>
  `${date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB`;

/**
 * Pita di server salinan (env MIRROR_OF): memberi tahu bahwa data di sini adalah salinan harian
 * yang hanya bisa dilihat, dan menautkan ke aplikasi utama. Tidak tampil di aplikasi utama.
 */
export async function MirrorBanner() {
  const main = mirrorOf();
  if (!main) return null;
  const copiedAt = await lastCopiedAt();
  return (
    <div
      role="status"
      className="bg-sky-100 px-4 py-1.5 text-center text-xs font-medium text-sky-950 dark:bg-sky-950 dark:text-sky-100"
    >
      <Copy className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden />
      Salinan cadangan{copiedAt ? ` per ${formatTime(copiedAt)}` : ""} — hanya untuk melihat.{" "}
      <a href={main} className="underline underline-offset-2">
        Buka aplikasi utama
      </a>
    </div>
  );
}
