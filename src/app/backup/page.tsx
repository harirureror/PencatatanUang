import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, CalendarClock, History } from "lucide-react";

import { BackupArchiveList } from "@/components/backup/backup-archive-list";
import { BackupNow } from "@/components/backup/backup-now";
import { DriveConnection } from "@/components/backup/drive-connection";
import { getBackupOverview } from "@/lib/mock-backups";
import { getCurrentUserId } from "@/server/current-user";

export const metadata = { title: "Backup · UangLapangan" };

const dateTime = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/** Hasil kembali dari login Google (/api/drive/callback → /backup?drive=…). */
const DRIVE_RESULT: Record<string, { tone: "ok" | "error"; text: string }> = {
  terhubung: { tone: "ok", text: "Google Drive berhasil terhubung. Backup otomatis berjalan sesuai jadwal." },
  ditolak: { tone: "error", text: "Izin Google Drive tidak diberikan — Drive belum terhubung." },
  "tidak-sah": { tone: "error", text: "Permintaan menghubungkan Drive kedaluwarsa atau tidak sah. Coba lagi." },
  gagal: { tone: "error", text: "Gagal menghubungkan Google Drive. Coba lagi beberapa saat lagi." },
  "belum-dikonfigurasi": { tone: "error", text: "Login Google belum dikonfigurasi di server." },
};

export default async function BackupPage({ searchParams }: PageProps<"/backup">) {
  await connection();
  const { drive: driveResult } = await searchParams;
  const result = typeof driveResult === "string" ? DRIVE_RESULT[driveResult] : undefined;
  const { drive, schedule, nextRunAt, archives } = await getBackupOverview(await getCurrentUserId());
  const last = archives.find((a) => a.status === "berhasil");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <Link
          href="/sinkron"
          aria-label="Kembali ke sinkronisasi"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Backup</h1>
          <p className="text-sm text-muted-foreground">Arsip data ke Google Drive pribadi</p>
        </div>
      </header>

      {result && (
        <p
          role={result.tone === "error" ? "alert" : "status"}
          className={
            result.tone === "ok"
              ? "rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
              : "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {result.text}
        </p>
      )}

      <DriveConnection drive={drive} />

      <BackupNow latest={archives[0] ?? null} />

      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-background px-3 py-2.5 ring-1 ring-foreground/10">
          <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <History className="size-3" aria-hidden />
            Backup terakhir
          </dt>
          <dd className="text-sm font-medium">
            {last ? dateTime.format(new Date(last.createdAt)) : "Belum ada"}
          </dd>
        </div>
        <div className="rounded-xl bg-background px-3 py-2.5 ring-1 ring-foreground/10">
          <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarClock className="size-3" aria-hidden />
            Berikutnya
          </dt>
          <dd className="text-sm font-medium">
            {nextRunAt ? dateTime.format(new Date(nextRunAt)) : "Tidak dijadwalkan"}
          </dd>
        </div>
        <div className="col-span-2 rounded-xl bg-background px-3 py-2.5 ring-1 ring-foreground/10">
          <dt className="text-[11px] text-muted-foreground">Jadwal</dt>
          <dd className="text-sm font-medium">
            Otomatis {schedule.frequency} pukul {schedule.time} WIB · simpan {schedule.keepVersions} versi terakhir
          </dd>
        </div>
      </dl>

      <section aria-labelledby="riwayat-backup" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 id="riwayat-backup" className="text-sm font-semibold">
            Riwayat arsip
          </h2>
          <span className="text-xs text-muted-foreground">{archives.length} arsip</span>
        </div>
        <BackupArchiveList archives={archives} keepVersions={schedule.keepVersions} />
        <p className="px-1 text-xs text-muted-foreground">
          Arsip berisi seluruh data di server (proyek, kategori, transaksi) dalam satu file
          terkompresi, tersimpan di Drive milik Anda sendiri.
        </p>
      </section>
    </main>
  );
}
