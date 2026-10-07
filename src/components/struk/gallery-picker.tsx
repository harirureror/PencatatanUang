"use client";

import { useRef, useState } from "react";
import { Images, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";

type GalleryPickerProps = {
  /** Dipanggil sekali dengan semua foto terpilih yang sudah dikompres. */
  onPick: (files: File[]) => void;
  /** Sisa kuota foto untuk transaksi ini; 0 menonaktifkan tombol. */
  remaining: number;
  className?: string;
};

/**
 * Pilih satu atau beberapa foto bukti dari galeri / folder foto HP.
 * Tiap foto dikompres di perangkat sebelum diserahkan ke pemanggil.
 */
export function GalleryPicker({ onPick, remaining, className }: GalleryPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    const all = Array.from(list ?? []);
    if (all.length === 0) return;

    const images = all.filter((f) => f.type.startsWith("image/"));
    const taken = images.slice(0, remaining);
    const messages: string[] = [];
    if (images.length < all.length) {
      messages.push(`${all.length - images.length} file bukan gambar dilewati.`);
    }
    if (taken.length < images.length) {
      messages.push(`Hanya ${taken.length} foto yang diambil — maksimal 10 foto per transaksi.`);
    }
    setNotice(messages.length ? messages.join(" ") : null);
    if (taken.length === 0) return;

    // Diproses satu per satu agar memori HP tidak penuh saat memilih banyak foto besar.
    const compressed: File[] = [];
    setProgress({ done: 0, total: taken.length });
    try {
      for (const file of taken) {
        compressed.push(await compressImage(file));
        setProgress({ done: compressed.length, total: taken.length });
      }
      onPick(compressed);
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = ""; // supaya memilih foto yang sama lagi tetap memicu onChange
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full text-base"
        onClick={() => inputRef.current?.click()}
        disabled={busy || remaining <= 0}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Images aria-hidden />}
        {busy ? `Memproses ${progress.done}/${progress.total}…` : "Dari galeri"}
      </Button>
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
