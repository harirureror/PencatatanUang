"use client";

import { useState } from "react";
import Image from "next/image";

import { ReceiptViewer } from "@/components/struk/receipt-viewer";
import type { Receipt } from "@/lib/types";

const uploadedAt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

type ReceiptGalleryProps = {
  receipts: Receipt[];
  /** Judul transaksi, untuk teks alternatif foto. */
  title: string;
};

/** Grid foto bukti; ketuk salah satu untuk membuka penampil layar penuh. */
export function ReceiptGallery({ receipts, title }: ReceiptGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <ul className="grid grid-cols-2 gap-3">
        {receipts.map((r, i) => (
          <li key={r.id} className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`Buka foto struk ${i + 1} dari ${receipts.length} layar penuh`}
              className="block w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="relative aspect-[3/4] bg-muted">
                <Image
                  src={r.fileUrl}
                  alt={`Foto struk ${i + 1} dari ${receipts.length}: ${title}`}
                  fill
                  unoptimized
                  sizes="(max-width: 448px) 50vw, 208px"
                  className="object-cover"
                />
              </div>
              <div className="px-3 py-2">
                <p className="truncate text-xs font-medium">{r.fileName}</p>
                <p className="text-[11px] text-muted-foreground">
                  Diunggah {uploadedAt.format(new Date(r.uploadedAt))}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <ReceiptViewer
        receipts={receipts}
        index={openIndex}
        onIndexChange={setOpenIndex}
        title={title}
      />
    </>
  );
}
