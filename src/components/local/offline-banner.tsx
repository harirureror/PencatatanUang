"use client";

import { useEffect, useState } from "react";
import { CloudOff, Wifi } from "lucide-react";

import { useOnline, useOutbox } from "@/lib/local/replica-store";
import { APP_STATUS_BAR, OFFLINE_STATUS_BAR, setStatusBarBase } from "@/lib/native/status-bar";
import { cn } from "@/lib/utils";

const BACK_ONLINE_MS = 3000;

/**
 * Pita status koneksi di atas semua halaman. Tidak menghalangi apa pun — aplikasi tetap
 * bisa dipakai mencatat saat offline; pita ini hanya memberi tahu. Di aplikasi Android,
 * status bar ikut berwarna kuning selama offline supaya menyatu dengan pita.
 */
export function OfflineBanner() {
  const online = useOnline();
  const pending = useOutbox().length;

  useEffect(() => {
    setStatusBarBase(online ? APP_STATUS_BAR : OFFLINE_STATUS_BAR);
  }, [online]);

  // Tampilkan "Kembali online" sebentar setelah koneksi pulih.
  const [wasOffline, setWasOffline] = useState(false);
  const [showBack, setShowBack] = useState(false);
  if (!online && !wasOffline) setWasOffline(true);
  if (online && wasOffline) {
    setWasOffline(false);
    setShowBack(true);
  }
  useEffect(() => {
    if (!showBack) return;
    const t = window.setTimeout(() => setShowBack(false), BACK_ONLINE_MS);
    return () => window.clearTimeout(t);
  }, [showBack]);

  if (online && !showBack) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-40 flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium",
        online
          ? "bg-primary text-primary-foreground"
          : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
      )}
    >
      {online ? (
        <>
          <Wifi className="size-3.5 shrink-0" aria-hidden />
          Kembali online{pending > 0 ? ` — mengirim ${pending} perubahan…` : ""}
        </>
      ) : (
        <>
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
          Offline — catatan tetap bisa dibuat dan dikirim otomatis saat online
        </>
      )}
    </div>
  );
}
