"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";

import { ReceiptViewer } from "@/components/struk/receipt-viewer";
import type { Receipt } from "@/lib/types";

type AttachmentButtonProps = {
  receipts: Receipt[];
  /** Judul transaksi, untuk label & teks alternatif foto. */
  title: string;
};

/** Penanda lampiran di baris transaksi; ketuk untuk membuka foto bukti layar penuh. */
export function AttachmentButton({ receipts, title }: AttachmentButtonProps) {
  const [index, setIndex] = useState<number | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setIndex(0)}
        aria-label={`Lihat ${receipts.length} foto bukti: ${title}`}
        className="flex shrink-0 items-center gap-1 self-stretch px-3 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted active:bg-muted"
      >
        <Paperclip className="size-4" aria-hidden />
        <span aria-hidden>{receipts.length}</span>
      </button>
      <ReceiptViewer receipts={receipts} index={index} onIndexChange={setIndex} title={title} />
    </>
  );
}
