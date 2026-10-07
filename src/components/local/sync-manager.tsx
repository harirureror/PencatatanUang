"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  PULL_INTERVAL_MS,
  setSyncState,
  syncNow,
  useOnline,
  useOutbox,
} from "@/lib/local/replica-store";

const RETRY_MS = 30_000;

/**
 * Penggerak sinkronisasi dengan hub (PRD: hemat kuota, bukan realtime). Satu putaran =
 * kirim antrean perubahan (POST /api/sync/push) lalu tarik perubahan perangkat lain sejak
 * kursor terakhir (GET /api/sync/pull). Dipicu:
 * - saat aplikasi dibuka & kembali dilihat, saat koneksi kembali, dan tiap PULL_INTERVAL_MS;
 * - saat ada antrean (dicoba ulang tiap RETRY_MS selama masih tertunda);
 * hanya saat online & aplikasi tampil di layar.
 */
export function SyncManager() {
  const router = useRouter();
  const online = useOnline();
  const pending = useOutbox().length;

  // Penyegaran halaman tetap boleh jalan walau efek pemicunya sudah dibersihkan — yang dicek
  // hanya apakah komponen masih terpasang.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const sync = useCallback(() => {
    if (!navigator.onLine || document.visibilityState !== "visible") return;
    setSyncState({ nextPullAt: Date.now() + PULL_INTERVAL_MS });
    void syncNow().then((report) => {
      // Proyek aktif berganti di perangkat lain → bagian halaman yang dirender server ikut segar.
      if (mounted.current && report.rebuilt) router.refresh();
    });
  }, [router]);

  // Buka aplikasi: sinkron sekali.
  useEffect(() => {
    sync();
  }, [sync]);

  // Ada antrean → kirim (dan coba lagi berkala selama masih tertunda).
  useEffect(() => {
    if (!online || pending === 0) return;
    sync();
    const timer = window.setInterval(sync, RETRY_MS);
    return () => window.clearInterval(timer);
  }, [online, pending, sync]);

  // Berkala + saat aplikasi kembali dilihat.
  useEffect(() => {
    if (!online) {
      setSyncState({ nextPullAt: null });
      return;
    }
    setSyncState({ nextPullAt: Date.now() + PULL_INTERVAL_MS });
    const timer = window.setInterval(sync, PULL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [online, sync]);

  // Koneksi kembali: tarik perubahan dari perangkat lain.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) sync();
    wasOnline.current = online;
  }, [online, sync]);

  return null;
}
