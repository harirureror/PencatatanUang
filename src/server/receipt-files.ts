import { MAX_RECEIPTS_PER_TRANSACTION, MAX_UPLOAD_BYTES } from "@/lib/image";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/**
 * Ambil & periksa foto bukti dari FormData (field "receipts").
 * Hanya gambar, total ukuran ≤ MAX_UPLOAD_BYTES, dan jumlah tidak melewati batas per transaksi.
 */
export function readReceiptFiles(
  formData: FormData,
  existingCount = 0,
): { files: File[] } | { error: string } {
  const files = formData
    .getAll("receipts")
    .filter((v): v is File => typeof v !== "string" && v.size > 0);

  if (files.some((f) => !ALLOWED_TYPES.has(f.type))) {
    return { error: "Lampiran harus berupa foto (JPG, PNG, WEBP, atau HEIC)." };
  }
  if (existingCount + files.length > MAX_RECEIPTS_PER_TRANSACTION) {
    return { error: `Maksimal ${MAX_RECEIPTS_PER_TRANSACTION} foto untuk satu transaksi.` };
  }
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_UPLOAD_BYTES) {
    return { error: "Total ukuran foto terlalu besar untuk sekali simpan." };
  }
  return { files };
}

/** Kenali jenis gambar dari isi file (magic bytes), bukan dari tipe yang dikirim klien. */
export function sniffImageType(bytes: Uint8Array): string | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, j) => bytes[i + j] === b);
  const ascii = (i: number, s: string) => at(i, ...[...s].map((c) => c.charCodeAt(0)));
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(4, "ftyp")) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if (["heic", "heix", "heim", "heis", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
  }
  return null;
}
