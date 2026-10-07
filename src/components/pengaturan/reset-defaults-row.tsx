"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { resetSettings } from "@/lib/settings-client";
import { setThemeChoice } from "@/lib/theme";

/**
 * Kembalikan pengaturan ke bawaan: format uang Rupiah (titik pemisah ribuan), batas saldo menipis
 * (server) dan tema mengikuti HP (perangkat ini). Kategori, proyek, dan catatan TIDAK diubah.
 */
export function ResetDefaultsRow() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    try {
      await resetSettings();
      setThemeChoice("sistem");
      setOpen(false);
      setDone(true);
      setError(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengembalikan pengaturan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger
        render={
          <button
            type="button"
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-muted/60"
          />
        }
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <RotateCcw className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Kembalikan ke bawaan</span>
          <span className="block text-xs text-muted-foreground" aria-live="polite">
            {done ? "Sudah dikembalikan." : "Format uang & tampilan"}
          </span>
        </span>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Kembalikan pengaturan bawaan?</AlertDialogTitle>
          <AlertDialogDescription>
            Format uang kembali ke Rupiah (1.250.000), batas saldo menipis Rp1.000.000, dan tampilan
            mengikuti HP. Kategori, proyek, dan catatan tidak berubah.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
          <Button className="h-10" disabled={busy} onClick={() => void reset()}>
            {busy && <LoaderCircle className="animate-spin" aria-hidden />}
            Kembalikan
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
