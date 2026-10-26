"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/image";
import { useOnline } from "@/lib/local/replica-store";
import type { Receipt } from "@/lib/types";

type ReceiptActionsProps = {
  receipt: Receipt;
  /** Urutan foto (1, 2, …) untuk label tombol. */
  position: number;
};

/** Pesan dari jawaban API galat (termasuk detail teknis bila ada). */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
  return `${data?.error ?? fallback}${data ? "" : ` (HTTP ${res.status})`}${data?.detail ? ` — Detail teknis: ${data.detail}` : ""}`;
}

/**
 * Tombol "Ganti" & "Hapus" untuk satu foto bukti yang sudah tersimpan — catatannya sendiri
 * tidak ikut berubah. Ganti: pilih foto dari kamera/galeri (dikompres di perangkat) lalu
 * PUT /api/receipts/:id. Hapus: konfirmasi lalu DELETE /api/receipts/:id.
 */
export function ReceiptActions({ receipt, position }: ReceiptActionsProps) {
  const router = useRouter();
  const online = useOnline();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const [action, setAction] = useState<"ganti" | "hapus" | null>(null);

  function run(kind: "ganti" | "hapus", request: () => Promise<Response>, fallback: string) {
    setAction(kind);
    setError(null);
    startBusy(async () => {
      try {
        const res = await request();
        if (!res.ok) {
          setError(await errorMessage(res, fallback));
          return;
        }
        router.refresh();
      } catch {
        setError("Tidak bisa terhubung ke server. Coba lagi saat ada sinyal.");
      }
    });
  }

  async function replace(list: FileList | null) {
    const picked = list?.[0];
    if (inputRef.current) inputRef.current.value = ""; // foto yang sama bisa dipilih lagi
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      setError("Pilih file foto (JPG, PNG, WEBP, atau HEIC).");
      return;
    }
    const file = await compressImage(picked);
    const body = new FormData();
    body.append("receipts", file, file.name);
    run(
      "ganti",
      () => fetch(`/api/receipts/${encodeURIComponent(receipt.id)}`, { method: "PUT", body }),
      "Gagal mengganti foto. Coba lagi.",
    );
  }

  const disabled = busy || !online;

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-3">
      <div className="grid grid-cols-2 gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void replace(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          aria-label={`Ganti foto struk ${position}`}
        >
          {busy && action === "ganti" ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          Ganti
        </Button>

        <AlertDialog>
          <AlertDialogTrigger
            disabled={disabled}
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-destructive hover:text-destructive"
                aria-label={`Hapus foto struk ${position}`}
              />
            }
          >
            {busy && action === "hapus" ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
            Hapus
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive">
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle>Hapus foto ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Foto struk {position} ({receipt.fileName}) dihapus. Catatannya tetap ada dan tidak berubah.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-10">Batal</AlertDialogCancel>
              <AlertDialogCancel
                render={<Button className="h-10 bg-destructive text-white hover:bg-destructive/85" />}
                onClick={() =>
                  run(
                    "hapus",
                    () => fetch(`/api/receipts/${encodeURIComponent(receipt.id)}`, { method: "DELETE" }),
                    "Gagal menghapus foto. Coba lagi.",
                  )
                }
              >
                Ya, hapus foto
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && (
        <p role="alert" className="text-xs break-words text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
