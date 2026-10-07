"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RotateCcw, X } from "lucide-react";

import { CameraPermissionDialog } from "@/components/struk/camera-permission-dialog";
import { Button } from "@/components/ui/button";
import { compressImage, formatFileSize } from "@/lib/image";
import {
  checkCameraPermission,
  requestCameraPermission,
  type CameraPermission,
} from "@/lib/native/camera-permission";
import { cn } from "@/lib/utils";

type CameraCaptureProps = {
  /** Dipanggil saat pengguna menekan "Pakai foto" — file sudah dikompres. */
  onCapture: (file: File) => void;
  className?: string;
  /** Kelas tambahan untuk kotak pratinjau (mis. agar melebar di dalam grid). */
  previewClassName?: string;
  disabled?: boolean;
};

type Pending = { file: File; originalSize: number; url: string };

/**
 * Ambil foto struk dengan kamera belakang HP. Setelah memotret, pengguna melihat pratinjau
 * dan bisa mengulang, membatalkan, atau memakai foto tersebut.
 * Di perangkat tanpa kamera (desktop), tombol ini membuka pemilih file.
 */
export function CameraCapture({
  onCapture,
  className,
  previewClassName,
  disabled,
}: CameraCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [processing, setProcessing] = useState(false);

  // Lepas object URL pratinjau saat diganti / komponen dilepas.
  useEffect(() => {
    return () => {
      if (pending) URL.revokeObjectURL(pending.url);
    };
  }, [pending]);

  // Dialog izin kamera (aplikasi Android). null = tertutup.
  const [askStatus, setAskStatus] = useState<Exclude<CameraPermission, "granted"> | null>(null);
  const [checking, setChecking] = useState(false);
  const [stillDenied, setStillDenied] = useState(false);

  function closePermission() {
    setAskStatus(null);
    setStillDenied(false);
  }

  /** Kamera native di aplikasi Android; di browser pemilih file dengan capture. */
  async function launchCamera() {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      inputRef.current?.click();
      return;
    }
    const { CameraPermissionDeniedError, takeNativePhoto } = await import("@/lib/native/camera");
    try {
      const file = await takeNativePhoto();
      if (file) await handleFile(file);
    } catch (error) {
      if (error instanceof CameraPermissionDeniedError) setAskStatus("denied");
      else console.warn("Kamera gagal:", error);
    }
  }

  // recheckPermission (useCallback) memanggil versi launchCamera terbaru lewat ref.
  const launchRef = useRef(launchCamera);
  useEffect(() => {
    launchRef.current = launchCamera;
  });

  async function openCamera() {
    const status = await checkCameraPermission();
    if (status === "granted") await launchCamera();
    else setAskStatus(status);
  }

  async function requestPermission() {
    setChecking(true);
    const status = await requestCameraPermission();
    setChecking(false);
    if (status === "granted") {
      closePermission();
      await launchCamera();
    } else {
      setAskStatus(status);
    }
  }

  const recheckPermission = useCallback(async () => {
    setChecking(true);
    const status = await checkCameraPermission();
    setChecking(false);
    if (status === "granted") {
      setAskStatus(null);
      setStillDenied(false);
      await launchRef.current();
    } else {
      setStillDenied(true);
    }
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setProcessing(true);
    try {
      const compressed = await compressImage(file);
      setPending({
        file: compressed,
        originalSize: file.size,
        url: URL.createObjectURL(compressed),
      });
    } finally {
      setProcessing(false);
    }
  }

  function acceptPhoto() {
    if (!pending) return;
    onCapture(pending.file);
    setPending(null);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = ""; // supaya memilih/memotret ulang tetap memicu onChange
        }}
      />

      <CameraPermissionDialog
        status={askStatus}
        busy={checking}
        stillDenied={stillDenied}
        onRequest={() => void requestPermission()}
        onRecheck={() => void recheckPermission()}
        onClose={closePermission}
      />

      {pending ? (
        <div
          role="group"
          aria-label="Pratinjau foto struk"
          className={cn(
            "flex flex-col overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10",
            previewClassName,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau blob lokal */}
          <img
            src={pending.url}
            alt="Pratinjau foto struk yang baru diambil"
            className="max-h-[60vh] w-full bg-muted object-contain"
          />
          <p className="px-3 pt-2 text-xs text-muted-foreground">
            {formatFileSize(pending.file.size)}
            {pending.file.size < pending.originalSize &&
              ` (dikompres dari ${formatFileSize(pending.originalSize)})`}
          </p>
          <div className="grid grid-cols-3 gap-2 p-3">
            <Button type="button" variant="outline" className="h-11" onClick={() => setPending(null)}>
              <X aria-hidden />
              Batal
            </Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => void openCamera()}>
              <RotateCcw aria-hidden />
              Ulangi
            </Button>
            <Button type="button" className="h-11" onClick={acceptPhoto}>
              <Check aria-hidden />
              Pakai
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full text-base"
          onClick={() => void openCamera()}
          disabled={processing || disabled}
        >
          {processing ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Camera aria-hidden />
          )}
          {processing ? "Memproses foto…" : "Foto struk"}
        </Button>
      )}
    </div>
  );
}
