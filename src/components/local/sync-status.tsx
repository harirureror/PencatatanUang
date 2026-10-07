"use client";

import Link from "next/link";
import {
  ChevronRight,
  CloudOff,
  CloudUpload,
  HardDrive,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import {
  PULL_INTERVAL_MS,
  useFailedOps,
  useOnline,
  useOutbox,
  useSyncState,
} from "@/lib/local/replica-store";
import { cn } from "@/lib/utils";

const time = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

type SyncStatusProps = {
  /** Waktu data terakhir ditarik dari server. */
  syncedAt: string;
  /** Apakah data yang tampil sudah tersimpan di perangkat. */
  onDevice: boolean;
  className?: string;
};

/**
 * Penanda sumber & status data: tersimpan di perangkat, offline, perubahan yang menunggu
 * dikirim, dan perubahan yang ditolak server.
 */
export function SyncStatus({ syncedAt, onDevice, className }: SyncStatusProps) {
  const online = useOnline();
  const pending = useOutbox().length;
  const failed = useFailedOps();
  const { syncing } = useSyncState();
  const at = time.format(new Date(syncedAt));

  let icon = <HardDrive className="size-3.5 shrink-0" aria-hidden />;
  let text = `Tersimpan di perangkat · sinkron ${at} · otomatis tiap ${PULL_INTERVAL_MS / 60_000} mnt`;
  let tone = "text-muted-foreground";
  if (!online) {
    icon = <CloudOff className="size-3.5 shrink-0" aria-hidden />;
    text =
      pending > 0
        ? `Offline — ${pending} perubahan tersimpan di perangkat, dikirim saat online`
        : `Offline — menampilkan data di perangkat (sinkron terakhir ${at})`;
    tone = "text-amber-700 dark:text-amber-400";
  } else if (pending > 0) {
    icon = <CloudUpload className="size-3.5 shrink-0 animate-pulse" aria-hidden />;
    text = `Mengirim ${pending} perubahan ke server…`;
  } else if (syncing) {
    icon = <RefreshCw className="size-3.5 shrink-0 animate-spin" aria-hidden />;
    text = "Menyinkronkan dengan server…";
  } else if (!onDevice) {
    icon = <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />;
    text = "Menyimpan data ke perangkat…";
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Link
        href="/sinkron"
        className={cn("flex items-center gap-1.5 text-xs hover:underline", tone)}
        aria-label={`${text}. Buka halaman sinkronisasi`}
      >
        <span role="status" className="flex items-center gap-1.5">
          {icon}
          {text}
        </span>
        <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
      </Link>
      {failed.length > 0 && (
        <Link
          href="/sinkron"
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/15"
        >
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          <span className="flex-1">
            {failed.length} perubahan offline perlu tindakan (bentrok atau ditolak server). Ketuk
            untuk memilih.
          </span>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
      )}
    </div>
  );
}
