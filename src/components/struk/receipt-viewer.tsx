"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { setBackGuard } from "@/lib/native/back-guard";
import { setStatusBarOverlay } from "@/lib/native/status-bar";
import type { Receipt } from "@/lib/types";
import { cn } from "@/lib/utils";

type ReceiptViewerProps = {
  receipts: Receipt[];
  /** Indeks foto yang dibuka; null = tertutup. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** Judul transaksi, untuk teks alternatif foto. */
  title: string;
};

const SWIPE_MIN_PX = 50;

/**
 * Penampil foto bukti layar penuh. Pindah foto lewat tombol ‹ ›, geser (swipe), atau panah
 * keyboard; ketuk foto untuk memperbesar 2× lebar layar (lalu geser) agar tulisan nota terbaca.
 * Di aplikasi Android: tombol back menutup penampil (bukan meninggalkan halaman) dan status
 * bar ikut hitam selama penampil terbuka.
 */
export function ReceiptViewer({ receipts, index, onIndexChange, title }: ReceiptViewerProps) {
  const [zoomed, setZoomed] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const open = index !== null && receipts.length > 0;
  const current = open ? receipts[index] : null;
  const total = receipts.length;

  function close() {
    setZoomed(false);
    onIndexChange(null);
  }
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    const removeGuard = setBackGuard(() => {
      closeRef.current();
      return false;
    });
    setStatusBarOverlay({ color: "#000000" });
    return () => {
      removeGuard();
      setStatusBarOverlay(null);
    };
  }, [open]);

  function go(step: number) {
    if (index === null || total < 2) return;
    setZoomed(false);
    onIndexChange((index + step + total) % total);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  }

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || zoomed) return; // saat diperbesar, geser dipakai untuk menggulir foto
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-black p-0 text-white ring-0 sm:max-w-none"
      >
        {current && index !== null && (
          <>
            <header className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
              <DialogClose
                aria-label="Tutup"
                className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X className="size-6" aria-hidden />
              </DialogClose>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-sm font-medium text-white">
                  {current.fileName}
                </DialogTitle>
                <p className="text-xs text-white/70" aria-live="polite">
                  Foto {index + 1} / {total}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                aria-pressed={zoomed}
                aria-label={zoomed ? "Perkecil" : "Perbesar"}
                className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
              >
                {zoomed ? <ZoomOut className="size-5" aria-hidden /> : <ZoomIn className="size-5" aria-hidden />}
              </button>
            </header>

            <div
              className={cn(
                "relative min-h-0 flex-1",
                zoomed ? "overflow-auto" : "flex items-center justify-center overflow-hidden",
              )}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- ukuran asli diperlukan untuk zoom */}
              <img
                key={current.id}
                src={current.fileUrl}
                alt={`Foto struk ${index + 1} dari ${total}: ${title}`}
                onClick={() => setZoomed((z) => !z)}
                draggable={false}
                className={cn(
                  "select-none",
                  zoomed
                    ? "h-auto w-[200%] max-w-none cursor-zoom-out"
                    : "max-h-full max-w-full cursor-zoom-in object-contain",
                )}
              />
            </div>

            {total > 1 && (
              <nav
                aria-label="Pindah foto"
                className="flex items-center justify-between gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              >
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Foto sebelumnya"
                  className="flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <ChevronLeft className="size-6" aria-hidden />
                </button>
                <div className="flex gap-1.5" aria-hidden>
                  {receipts.map((r, i) => (
                    <span
                      key={r.id}
                      className={cn("size-2 rounded-full", i === index ? "bg-white" : "bg-white/35")}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Foto berikutnya"
                  className="flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <ChevronRight className="size-6" aria-hidden />
                </button>
              </nav>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
