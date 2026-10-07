"use client";

import { useRef, useState, useTransition, type ReactNode, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, RefreshCw } from "lucide-react";

import { syncNow } from "@/lib/local/replica-store";
import { cn } from "@/lib/utils";

const TRIGGER_PX = 70;
const MAX_PULL_PX = 110;

/**
 * Tarik ke bawah dari atas halaman untuk sinkron: kirim antrean offline lalu tarik data
 * terbaru dari server. Gerakan umum di aplikasi Android; juga berfungsi di browser HP.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const startY = useRef<number | null>(null);

  function onTouchStart(e: TouchEvent) {
    startY.current = window.scrollY <= 0 && !refreshing ? e.touches[0].clientY : null;
  }

  function onTouchMove(e: TouchEvent) {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    // Redam tarikan supaya terasa "berat", dan abaikan gerakan ke atas.
    setPull(dy > 0 ? Math.min(MAX_PULL_PX, dy * 0.5) : 0);
  }

  function onTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;
    const triggered = pull >= TRIGGER_PX;
    setPull(0);
    if (triggered && navigator.onLine) {
      startRefresh(async () => {
        await syncNow(); // kirim antrean + tarik perubahan dari hub
        router.refresh();
      });
    }
  }

  const ready = pull >= TRIGGER_PX;
  const visible = pull > 0 || refreshing;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div
        aria-hidden={!visible}
        className={cn(
          "flex items-end justify-center overflow-hidden text-xs text-muted-foreground transition-[height] duration-150",
          pull > 0 && "duration-0",
        )}
        style={{ height: refreshing ? 40 : pull }}
      >
        {visible && (
          <span role="status" className="mb-2 flex items-center gap-1.5">
            {refreshing ? (
              <RefreshCw className="size-4 animate-spin text-primary" aria-hidden />
            ) : (
              <ArrowDown className={cn("size-4 transition-transform", ready && "rotate-180 text-primary")} aria-hidden />
            )}
            {refreshing ? "Menyinkronkan…" : ready ? "Lepas untuk sinkron" : "Tarik untuk sinkron"}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
