"use client"; // Error boundary harus Client Component

import { useEffect } from "react";
import { CloudOff, RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/local/replica-store";

/** Tampilan ramah saat sebuah halaman gagal dimuat — terutama karena koneksi putus. */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const online = useOnline();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        {online ? (
          <TriangleAlert className="size-7" aria-hidden />
        ) : (
          <CloudOff className="size-7" aria-hidden />
        )}
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">
          {online ? "Halaman gagal dimuat" : "Tidak ada koneksi"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {online
            ? "Terjadi gangguan sesaat. Data Anda aman — silakan coba lagi."
            : "Halaman ini butuh sinyal untuk dimuat. Catatan yang sudah ada tetap tersimpan di perangkat."}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button className="h-12 text-base" onClick={() => retry()}>
          <RotateCcw aria-hidden />
          Coba lagi
        </Button>
        <Button variant="outline" className="h-12 text-base" onClick={() => window.history.back()}>
          Kembali
        </Button>
      </div>
    </main>
  );
}
