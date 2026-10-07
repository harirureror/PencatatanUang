"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";

import { ReceiptPicker, type PickedPhoto } from "@/components/struk/receipt-picker";
import { Button } from "@/components/ui/button";
import { formatFileSize, MAX_UPLOAD_BYTES } from "@/lib/image";
import { useOnline } from "@/lib/local/replica-store";

type NewReceiptsProps = {
  transactionId: string;
  existingCount: number;
};

/** Tambah foto struk langsung dari halaman lampiran — diunggah ke POST /api/transactions/:id/receipts. */
export function NewReceipts({ transactionId, existingCount }: NewReceiptsProps) {
  const router = useRouter();
  const online = useOnline();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const total = photos.reduce((sum, p) => sum + p.file.size, 0);

  function upload() {
    if (total > MAX_UPLOAD_BYTES) {
      setError(
        `Total foto ${formatFileSize(total)} — maksimal ${formatFileSize(MAX_UPLOAD_BYTES)} sekali simpan. Hapus beberapa foto dulu.`,
      );
      return;
    }
    startSaving(async () => {
      const body = new FormData();
      for (const p of photos) body.append("receipts", p.file, p.file.name);
      try {
        const res = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}/receipts`, {
          method: "POST",
          body,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error ?? "Gagal menyimpan foto. Coba lagi.");
          return;
        }
      } catch {
        setError("Tidak bisa terhubung ke server. Coba lagi saat ada sinyal.");
        return;
      }
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      setError(null);
      router.refresh(); // tampilkan foto yang baru tersimpan di galeri
    });
  }

  return (
    <section aria-labelledby="foto-baru" className="flex flex-col gap-3">
      <h2 id="foto-baru" className="px-1 text-sm font-medium">
        Tambah foto
      </h2>
      <ReceiptPicker
        photos={photos}
        onChange={(next) => {
          setPhotos(next);
          setError(null);
        }}
        existingCount={existingCount}
      />
      {error && (
        <p role="alert" className="px-1 text-sm text-destructive">
          {error}
        </p>
      )}
      {photos.length > 0 && (
        <>
          <Button type="button" className="h-12 text-base" onClick={upload} disabled={saving || !online}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            {saving ? "Mengunggah…" : `Simpan ${photos.length} foto`}
          </Button>
          {!online && (
            <p className="px-1 text-xs text-amber-700 dark:text-amber-400">
              Sedang offline — foto bisa disimpan begitu ada sinyal.
            </p>
          )}
        </>
      )}
    </section>
  );
}
