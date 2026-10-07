// Memotret struk dengan kamera native di aplikasi Android (plugin @capacitor/camera,
// takePhoto). Di browser tidak dipakai — CameraCapture memakai <input capture>.
import { RECEIPT_MAX_SIZE } from "@/lib/image";

/** Pengguna menolak izin kamera (perlu dialog "akses diblokir"). */
export class CameraPermissionDeniedError extends Error {}

export type NativePhotoResult = { uri?: string; webPath?: string; metadata?: { format?: string } };

/** Pembaca isi foto (bisa diganti saat pengujian). */
export type PhotoReaders = {
  fetchWebPath(webPath: string): Promise<Blob>;
  readNativeFile(uri: string): Promise<string>; // base64
};

const mimeOf = (format?: string) => {
  const f = (format ?? "jpeg").toLowerCase();
  if (f === "png") return "image/png";
  if (f === "webp") return "image/webp";
  if (f === "heic" || f === "heif") return `image/${f}`;
  return "image/jpeg";
};

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Hasil kamera → File. Dicoba lewat webPath (cepat); bila tidak bisa diambil (aplikasi memuat
 * web dari server lain, server.url), dibaca langsung dari penyimpanan perangkat.
 */
export async function photoToFile(result: NativePhotoResult, readers: PhotoReaders, now = Date.now()): Promise<File> {
  const type = mimeOf(result.metadata?.format);
  const name = `struk-${new Date(now).toISOString().slice(0, 19).replace(/[-:T]/g, "")}.${type === "image/jpeg" ? "jpg" : type.slice(6)}`;
  if (result.webPath) {
    try {
      const blob = await readers.fetchWebPath(result.webPath);
      if (blob.size > 0) return new File([blob], name, { type: blob.type || type });
    } catch {
      // lanjut ke pembacaan langsung
    }
  }
  if (!result.uri) throw new Error("Kamera tidak mengembalikan foto.");
  const bytes = base64ToBytes(await readers.readNativeFile(result.uri));
  return new File([new Uint8Array(bytes)], name, { type });
}

const isCancel = (message: string) => /cancel|batal/i.test(message);
const isDenied = (message: string) => /denied|permission/i.test(message);

/**
 * Buka kamera belakang dan kembalikan fotonya; null bila pengguna membatalkan.
 * Melempar CameraPermissionDeniedError bila izin kamera ditolak.
 */
export async function takeNativePhoto(): Promise<File | null> {
  const [{ Camera }, { Filesystem }] = await Promise.all([
    import("@capacitor/camera"),
    import("@capacitor/filesystem"),
  ]);
  let result: NativePhotoResult;
  try {
    result = await Camera.takePhoto({
      quality: 80,
      targetWidth: RECEIPT_MAX_SIZE,
      targetHeight: RECEIPT_MAX_SIZE,
      correctOrientation: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isCancel(message)) return null;
    if (isDenied(message)) throw new CameraPermissionDeniedError(message);
    throw error;
  }
  return photoToFile(result, {
    fetchWebPath: async (webPath) => {
      const res = await fetch(webPath);
      if (!res.ok) throw new Error(String(res.status));
      return res.blob();
    },
    readNativeFile: async (uri) => {
      const { data } = await Filesystem.readFile({ path: uri });
      if (typeof data !== "string") throw new Error("Format file tidak dikenali.");
      return data;
    },
  });
}
