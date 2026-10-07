"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ChevronRight, CloudAlert, X } from "lucide-react";

import { dismissNotification } from "@/app/notifikasi/actions";
import type { AppNotification } from "@/server/notifications";

/** Spanduk pemberitahuan (mis. backup gagal) dengan tautan tindak lanjut & tombol tutup. */
export function NotificationBanner({ notification }: { notification: AppNotification }) {
  const [pending, startTransition] = useTransition();
  const n = notification;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive ring-1 ring-destructive/20"
    >
      <CloudAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {n.title}
          {n.count > 1 && <span className="font-normal"> · {n.count} kali berturut-turut</span>}
        </p>
        <p className="text-xs text-destructive/90">{n.body}</p>
        {n.link && (
          <Link href={n.link} className="mt-1 inline-flex items-center gap-0.5 text-xs font-semibold underline-offset-2 hover:underline">
            Perbaiki
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      <button
        type="button"
        aria-label="Tutup pemberitahuan"
        disabled={pending}
        onClick={() => startTransition(() => dismissNotification(n.id))}
        className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-destructive/10 disabled:opacity-50"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
