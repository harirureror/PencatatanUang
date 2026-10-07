"use client";

import Link from "next/link";
import { CloudAlert, CloudCheck, CloudOff, CloudUpload, RefreshCw } from "lucide-react";

import { useFailedOps, useOnline, useOutbox, useSyncState } from "@/lib/local/replica-store";
import { cn } from "@/lib/utils";

/**
 * Ikon status sinkron yang ringkas untuk header — selalu terlihat di atas layar HP tanpa
 * perlu menggulir. Ketuk untuk membuka halaman Sinkronisasi.
 */
export function SyncBadge() {
  const online = useOnline();
  const pending = useOutbox().length;
  const failed = useFailedOps().length;
  const { syncing } = useSyncState();

  let Icon = CloudCheck;
  let label = "Semua data tersinkron";
  let tone = "text-primary";
  let count = 0;
  let countTone = "bg-primary text-primary-foreground";
  let spin = false;

  if (failed > 0) {
    Icon = CloudAlert;
    label = `${failed} perubahan offline perlu tindakan`;
    tone = "text-destructive ring-destructive/40";
    count = failed;
    countTone = "bg-destructive text-white";
  } else if (!online) {
    Icon = CloudOff;
    label = pending > 0 ? `Offline — ${pending} perubahan menunggu dikirim` : "Offline";
    tone = "text-amber-700 ring-amber-400 dark:text-amber-400";
    count = pending;
    countTone = "bg-amber-500 text-white";
  } else if (pending > 0) {
    Icon = CloudUpload;
    label = `Mengirim ${pending} perubahan`;
    count = pending;
  } else if (syncing) {
    Icon = RefreshCw;
    label = "Menyinkronkan";
    spin = true;
  }

  return (
    <Link
      href="/sinkron"
      aria-label={`${label}. Buka halaman sinkronisasi`}
      title={label}
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ring-foreground/10 hover:bg-muted",
        tone,
      )}
    >
      <Icon
        className={cn("size-5", spin && "animate-spin", Icon === CloudUpload && "animate-pulse")}
        aria-hidden
      />
      {count > 0 && (
        <span
          aria-hidden
          className={cn(
            "absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums ring-2 ring-background",
            countTone,
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
