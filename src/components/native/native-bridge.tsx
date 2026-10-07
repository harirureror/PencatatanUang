"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { flushOutbox, pendingCount, syncNow } from "@/lib/local/replica-store";
import { createAppStateHandler } from "@/lib/native/app-lifecycle";
import { canGoBack as backAllowed } from "@/lib/native/back-guard";
import { setStatusBarOverlay } from "@/lib/native/status-bar";

const onAppState = createAppStateHandler({
  online: () => navigator.onLine,
  pending: pendingCount,
  syncNow,
  flushOutbox,
});

/**
 * Penyesuaian saat web berjalan di dalam aplikasi Android (Capacitor). Di browser biasa
 * komponen ini tidak melakukan apa-apa.
 * - Tombol back Android: kembali ke halaman sebelumnya; di dashboard → tutup aplikasi.
 *   Halaman bisa menahannya lewat setBackGuard (mis. form dengan isian belum tersimpan).
 * - Status bar mengikuti warna aplikasi (lihat lib/native/status-bar.ts).
 * - Sinkron mengikuti siklus hidup aplikasi (lib/native/app-lifecycle.ts).
 * - Kelas `native` di <html> untuk penyesuaian tampilan khusus aplikasi.
 */
export function NativeBridge() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (cancelled || !Capacitor.isNativePlatform()) return;
      document.documentElement.classList.add("native");

      setStatusBarOverlay(null); // terapkan warna dasar (hijau / kuning saat offline)

      const { App } = await import("@capacitor/app");

      const handles = await Promise.all([
        App.addListener("backButton", ({ canGoBack }) => {
          if (!backAllowed()) return;
          if (pathRef.current === "/" || !canGoBack) void App.exitApp();
          else window.history.back();
        }),
        // Sinkron saat aplikasi kembali ke depan / kirim antrean saat ke latar belakang.
        App.addListener("appStateChange", ({ isActive }) => void onAppState(isActive)),
      ]);
      const removeAll = () => handles.forEach((h) => void h.remove());
      if (cancelled) removeAll();
      else cleanup = removeAll;
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
