"use client";

import { useEffect } from "react";
import { Camera, Loader2, Settings, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CameraPermission } from "@/lib/native/camera-permission";

type CameraPermissionDialogProps = {
  /** Status izin yang sedang ditampilkan; null = dialog tertutup. */
  status: Exclude<CameraPermission, "granted"> | null;
  busy: boolean;
  /** Pengecekan ulang setelah dari Pengaturan tetap belum diizinkan. */
  stillDenied: boolean;
  onRequest: () => void;
  onRecheck: () => void;
  onClose: () => void;
};

const SETTINGS_STEPS = [
  "Buka Pengaturan HP",
  "Pilih Aplikasi → UangLapangan",
  "Pilih Izin → Kamera",
  "Pilih “Izinkan hanya saat aplikasi digunakan”",
];

/**
 * Penjelasan sebelum Android menampilkan dialog izin kamera, dan panduan ke Pengaturan
 * bila izin sudah ditolak permanen. Galeri tetap bisa dipakai tanpa izin kamera.
 */
export function CameraPermissionDialog({
  status,
  busy,
  stillDenied,
  onRequest,
  onRecheck,
  onClose,
}: CameraPermissionDialogProps) {
  const denied = status === "denied";

  // Kembali dari Pengaturan HP → aplikasi tampil lagi → cek ulang otomatis.
  useEffect(() => {
    if (!denied) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") onRecheck();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [denied, onRecheck]);

  return (
    <Dialog open={status !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <span
            aria-hidden
            className={
              denied
                ? "flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                : "flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
            }
          >
            {denied ? <ShieldAlert className="size-6" /> : <Camera className="size-6" />}
          </span>
          <DialogTitle className="text-base">
            {denied ? "Akses kamera diblokir" : "Izinkan akses kamera"}
          </DialogTitle>
          <DialogDescription>
            {denied
              ? "Izin kamera untuk UangLapangan ditolak, jadi aplikasi tidak bisa membuka kamera. Aktifkan lewat Pengaturan HP:"
              : "UangLapangan memakai kamera hanya untuk memotret struk atau nota sebagai bukti transaksi. Foto tidak diambil tanpa kamu menekan tombol."}
          </DialogDescription>
        </DialogHeader>

        {denied ? (
          <ol className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-3 text-sm">
            {SETTINGS_STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold ring-1 ring-foreground/10">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        ) : (
          status === "prompt-again" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800">
              Sebelumnya izin kamera ditolak. Pilih “Izinkan” di dialog berikutnya supaya bisa
              memotret struk.
            </p>
          )
        )}

        {stillDenied && (
          <p role="alert" className="text-sm text-destructive">
            Kamera masih belum diizinkan. Ikuti langkah di atas lalu coba lagi.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Tanpa izin kamera, foto struk tetap bisa ditambahkan lewat tombol “Dari galeri”.
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={onClose}>
            Nanti saja
          </Button>
          {denied ? (
            <Button type="button" className="h-11" onClick={onRecheck} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Settings aria-hidden />}
              Sudah saya izinkan
            </Button>
          ) : (
            <Button type="button" className="h-11" onClick={onRequest} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
              Izinkan kamera
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
