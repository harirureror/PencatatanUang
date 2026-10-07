"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, LoaderCircle, LogOut, TriangleAlert } from "lucide-react";

import { useSetSession } from "@/components/auth/use-session";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signOut as signOutRequest } from "@/lib/auth-client";
import { clearLocalAccountData } from "@/lib/local/account-scope";
import { syncNow, useOnline, useOutbox } from "@/lib/local/replica-store";

/**
 * Isi dialog konfirmasi keluar (dipakai di dalam <DialogContent>). Memperingatkan bila masih ada
 * perubahan yang belum terkirim, menawarkan kirim dulu, lalu keluar + hapus data perangkat.
 */
export function SignOutConfirm({
  onCancel,
  onBusyChange,
}: {
  onCancel: () => void;
  /** Dialog induk sebaiknya tidak bisa ditutup selama proses berjalan. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const setSession = useSetSession();
  const pending = useOutbox().length;
  const online = useOnline();
  const [busy, setBusyState] = useState<"sync" | "signout" | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const setBusy = (b: typeof busy) => {
    setBusyState(b);
    onBusyChange?.(b !== null);
  };

  async function syncFirst() {
    setBusy("sync");
    setSyncError(null);
    try {
      const report = await syncNow();
      if (!report.ok) setSyncError("Belum semua perubahan terkirim. Coba lagi sebentar.");
    } catch {
      setSyncError("Gagal menyinkronkan. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy("signout");
    try {
      await signOutRequest();
      // Data akun di perangkat ini ikut dihapus (perangkat bersama tetap aman).
      await clearLocalAccountData();
      setSession(null);
      router.replace("/masuk");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Keluar dari akun?</DialogTitle>
        <DialogDescription>
          {pending === 0
            ? "Semua catatan sudah tersimpan di server. Masuk lagi kapan saja untuk melihatnya."
            : "Catatan yang sudah terkirim tetap aman di server."}
        </DialogDescription>
      </DialogHeader>
      {pending > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800"
        >
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>{pending} perubahan belum terkirim</strong> ke server. Kalau keluar sekarang, perubahan itu
              hilang dari perangkat ini.
            </span>
          </p>
          <Button
            variant="outline"
            className="h-10 bg-background"
            disabled={!online || busy !== null}
            onClick={() => void syncFirst()}
          >
            {busy === "sync" ? <LoaderCircle className="animate-spin" aria-hidden /> : <CloudUpload aria-hidden />}
            {busy === "sync" ? "Mengirim…" : online ? "Kirim dulu sekarang" : "Offline — tunggu ada sinyal"}
          </Button>
          {syncError && <p className="text-xs">{syncError}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" disabled={busy !== null} onClick={onCancel}>
          Batal
        </Button>
        <Button variant="destructive" className="h-11" disabled={busy !== null} onClick={() => void signOut()}>
          {busy === "signout" ? <LoaderCircle className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
          {pending > 0 ? "Tetap keluar" : "Keluar"}
        </Button>
      </div>
    </>
  );
}
