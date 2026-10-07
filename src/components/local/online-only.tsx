"use client";

import { CloudOff } from "lucide-react";

import { useOnline } from "@/lib/local/replica-store";
import { cn } from "@/lib/utils";

/**
 * Keterangan untuk aksi yang belum bisa dilakukan offline (butuh server). Dipakai bersama
 * tombol yang dinonaktifkan saat offline, supaya pengguna tahu alasannya — bukan error.
 */
export function OnlineOnlyHint({ action, className }: { action: string; className?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300", className)}>
      <CloudOff className="size-3.5 shrink-0" aria-hidden />
      {action} butuh koneksi internet. Coba lagi saat ada sinyal.
    </p>
  );
}
