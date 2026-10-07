import { deleteObject, getObject, putObject } from "@/server/object-storage";

// Penyimpanan file foto struk lewat object-storage: Cloudflare R2 di produksi, folder
// data/receipts saat pengembangan (lihat src/server/object-storage.ts). Database menyimpan
// kuncinya saja; foto hanya bisa dibaca lewat API yang memeriksa pemilik.

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const CONTENT_TYPES = Object.fromEntries(Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type]));

/** Kunci file: <id transaksi>/<id lampiran>.<ext> — dibentuk dari id buatan server saja. */
export function receiptKey(transactionId: string, receiptId: string, mimeType: string): string {
  return `${transactionId}/${receiptId}.${EXTENSIONS[mimeType] ?? "bin"}`;
}

/** Kunci file tersimpan (bukan URL publik data contoh seperti /contoh-struk/…). */
export function isStoredKey(fileUrl: string): boolean {
  return !fileUrl.startsWith("/") && !/^[a-z]+:/i.test(fileUrl);
}

const objectKey = (key: string) => `receipts/${key}`;

/** Simpan foto baru (tidak pernah menimpa file yang sudah ada). */
export async function saveReceiptFile(key: string, bytes: Uint8Array): Promise<void> {
  const ext = key.split(".").pop() ?? "";
  await putObject(objectKey(key), bytes, { contentType: CONTENT_TYPES[ext] ?? "application/octet-stream" });
}

/** Isi file, atau null bila tidak ada. */
export async function readReceiptFile(key: string): Promise<Buffer | null> {
  return getObject(objectKey(key));
}

/** Hapus file (tidak galat bila sudah tidak ada). */
export async function deleteReceiptFile(key: string): Promise<void> {
  await deleteObject(objectKey(key));
}
