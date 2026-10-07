"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { CameraCapture } from "@/components/struk/camera-capture";
import { GalleryPicker } from "@/components/struk/gallery-picker";
import { formatFileSize, MAX_RECEIPTS_PER_TRANSACTION } from "@/lib/image";

/** Foto bukti yang baru dipilih di perangkat (belum tersimpan). */
export type PickedPhoto = { id: string; file: File; url: string };

type ReceiptPickerProps = {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  /** Jumlah lampiran yang sudah tersimpan — ikut dihitung dalam batas per transaksi. */
  existingCount?: number;
};

/**
 * Tambah foto bukti dari kamera atau galeri, lengkap dengan pratinjau & tombol hapus.
 * Komponen ini yang membuat dan melepas object URL pratinjau.
 */
export function ReceiptPicker({ photos, onChange, existingCount = 0 }: ReceiptPickerProps) {
  const remaining = Math.max(0, MAX_RECEIPTS_PER_TRANSACTION - existingCount - photos.length);

  // Lepas object URL yang tersisa hanya saat komponen dilepas.
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  }, [photos]);
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function add(files: File[]) {
    onChange([
      ...photos,
      ...files.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) })),
    ]);
  }

  function remove(photo: PickedPhoto) {
    URL.revokeObjectURL(photo.url);
    onChange(photos.filter((p) => p.id !== photo.id));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 items-start gap-2">
        <CameraCapture
          onCapture={(file) => add([file])}
          disabled={remaining <= 0}
          className="contents"
          previewClassName="col-span-2"
        />
        <GalleryPicker onPick={add} remaining={remaining} />
      </div>
      {remaining <= 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          Sudah {MAX_RECEIPTS_PER_TRANSACTION} foto — batas maksimal untuk satu transaksi.
        </p>
      )}

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2" aria-label="Foto bukti baru">
          {photos.map((p, i) => (
            <li key={p.id} className="relative overflow-hidden rounded-lg ring-1 ring-foreground/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau blob lokal */}
              <img
                src={p.url}
                alt={`Foto baru ${i + 1}`}
                className="aspect-[3/4] w-full bg-muted object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                {formatFileSize(p.file.size)}
              </span>
              <button
                type="button"
                onClick={() => remove(p)}
                aria-label={`Hapus foto baru ${i + 1}`}
                className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
