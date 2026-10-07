/** Batas sisi terpanjang foto struk setelah dikompres — tulisan nota tetap terbaca. */
export const RECEIPT_MAX_SIZE = 1600;

/** Jumlah maksimal foto bukti untuk satu transaksi. */
export const MAX_RECEIPTS_PER_TRANSACTION = 10;

/**
 * Total ukuran foto yang dikirim sekali simpan. Sama dengan serverActions.bodySizeLimit di
 * next.config.ts dan di bawah batas request Vercel (~4,5 MB).
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const JPEG_QUALITY = 0.8;

/**
 * Perkecil & kompres foto di perangkat sebelum disimpan/diunggah (hemat kuota & penyimpanan).
 * Orientasi EXIF dari kamera HP ikut diterapkan. Bila browser tidak mampu memproses
 * (mis. format tidak didukung), file asli dikembalikan apa adanya.
 */
export async function compressImage(file: File, maxSize = RECEIPT_MAX_SIZE): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // latar putih untuk PNG transparan
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    // Jangan kembalikan hasil yang justru lebih besar dari aslinya.
    if (!blob || (blob.size >= file.size && file.type === "image/jpeg")) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "struk";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** "1234567" → "1,2 MB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
}
