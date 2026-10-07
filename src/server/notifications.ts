// Pemberitahuan untuk pengguna. Saat ini: backup gagal.
// - Di aplikasi: spanduk di dashboard & Sinkronisasi sampai ditutup atau masalahnya selesai.
// - Email (bila dikonfigurasi): hanya untuk backup TERJADWAL (pengguna sedang tidak melihat
//   aplikasi), sekali per rangkaian kegagalan — kegagalan berikutnya hanya menambah hitungan.
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { driveConnections, notifications, users, type NotificationRow } from "@/db/schema";
import type { BackupArchive } from "@/lib/backup";
import { sendEmail } from "@/server/mailer";

export type AppNotification = {
  id: string;
  kind: NotificationRow["kind"];
  title: string;
  body: string;
  link: string | null;
  count: number;
  createdAt: string;
  updatedAt: string;
};

const toNotification = (r: NotificationRow): AppNotification => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  link: r.link,
  count: r.count,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** Pemberitahuan yang masih perlu dilihat pengguna (belum selesai & belum ditutup). */
export async function listOpenNotifications(userId: string): Promise<AppNotification[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.resolvedAt), isNull(notifications.readAt)))
    .orderBy(desc(notifications.updatedAt));
  return rows.map(toNotification);
}

/** Tutup satu pemberitahuan (muncul lagi bila kejadiannya berulang). False bila tidak ada. */
export async function dismissNotification(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/** Alamat email pengguna: akun aplikasi, atau akun Google Drive yang terhubung. */
async function recipient(userId: string): Promise<string | null> {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (u?.email) return u.email;
  const [d] = await db
    .select({ email: driveConnections.accountEmail, mode: driveConnections.mode })
    .from(driveConnections)
    .where(eq(driveConnections.userId, userId))
    .limit(1);
  return d?.mode === "google" && d.email.includes("@") ? d.email : null;
}

/** Backup gagal → buka / perbarui pemberitahuan, kirim email bila perlu. */
export async function notifyBackupFailed(userId: string, archive: BackupArchive): Promise<AppNotification> {
  const reason = archive.error ?? "tanpa keterangan";
  const when = archive.trigger === "terjadwal" ? "Backup terjadwal" : "Backup";
  const [open] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.kind, "backup_gagal"), isNull(notifications.resolvedAt)))
    .limit(1);

  let row: NotificationRow;
  if (open) {
    [row] = await db
      .update(notifications)
      .set({
        count: open.count + 1,
        body: `${when} gagal lagi: ${reason}`,
        readAt: null, // ditutup sebelumnya → tampil lagi karena gagal lagi
      })
      .where(eq(notifications.id, open.id))
      .returning();
  } else {
    [row] = await db
      .insert(notifications)
      .values({
        userId,
        kind: "backup_gagal",
        title: "Backup gagal",
        body: `${when} gagal: ${reason}`,
        link: "/backup",
      })
      .returning();
  }

  // Email hanya untuk backup terjadwal, sekali per rangkaian kegagalan.
  if (archive.trigger === "terjadwal" && !row.emailedAt) {
    const to = await recipient(userId);
    const sent =
      to &&
      (await sendEmail({
        to,
        subject: "UangLapangan: backup data gagal",
        text: [
          `${when} data UangLapangan Anda gagal.`,
          `Penyebab: ${reason}`,
          "",
          "Buka aplikasi → Sinkronisasi → Backup untuk memperbaikinya. Data di aplikasi tetap aman;",
          "backup akan dicoba lagi pada jadwal berikutnya.",
        ].join("\n"),
      }));
    if (sent) {
      [row] = await db
        .update(notifications)
        .set({ emailedAt: new Date().toISOString() })
        .where(eq(notifications.id, row.id))
        .returning();
    }
  }
  return toNotification(row);
}

/** Backup berhasil lagi → pemberitahuan gagal ditutup otomatis. */
export async function resolveBackupFailure(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ resolvedAt: new Date().toISOString() })
    .where(and(eq(notifications.userId, userId), eq(notifications.kind, "backup_gagal"), isNull(notifications.resolvedAt)));
}
