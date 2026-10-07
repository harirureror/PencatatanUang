// Unggah arsip backup ke Google Drive pengguna (Drive API v3, izin drive.file).
// - Folder "UangLapangan Backup" dicari / dibuat sekali, id-nya disimpan; dibuat ulang bila
//   pengguna menghapusnya.
// - Unggah "resumable" (aman untuk arsip besar berisi foto), lalu MD5 dari Google dicocokkan
//   dengan file asli — arsip yang rusak di jalan dianggap gagal.
// - 401 → token diperbarui sekali lalu diulang; 429/5xx → diulang dengan jeda; Drive penuh /
//   izin dicabut → pesan yang jelas untuk pengguna.
import { createHash } from "node:crypto";

import {
  DRIVE_FOLDER_NAME,
  DriveNotConnectedError,
  getDriveAccessToken,
  getDriveTarget,
  setDriveFolder,
} from "@/server/drive-connections";

const API = () => process.env.GOOGLE_DRIVE_API_URL ?? "https://www.googleapis.com/drive/v3";
const UPLOAD = () => process.env.GOOGLE_DRIVE_UPLOAD_URL ?? "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const RETRIES = 2;

/** Galat yang pesannya aman ditampilkan ke pengguna (riwayat backup). */
export class DriveUploadError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Panggil Drive dengan token pengguna: 401 → perbarui token & ulangi; 429/5xx → ulangi. */
async function driveFetch(userId: string, url: string, init: RequestInit = {}): Promise<Response> {
  let forceRefresh = false;
  for (let attempt = 0; ; attempt++) {
    const token = await getDriveAccessToken(userId, { forceRefresh });
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } });
    } catch {
      if (attempt < RETRIES) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new DriveUploadError("Google Drive tidak bisa dihubungi (koneksi terputus).");
    }
    if (res.status === 401 && !forceRefresh) {
      forceRefresh = true;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
      await sleep(500 * 2 ** attempt);
      continue;
    }
    return res;
  }
}

async function failure(res: Response): Promise<DriveUploadError> {
  const body = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[]; message?: string } };
  const reason = body.error?.errors?.[0]?.reason;
  if (reason === "storageQuotaExceeded" || reason === "quotaExceeded") {
    return new DriveUploadError("Penyimpanan Google Drive penuh — kosongkan ruang lalu coba lagi.");
  }
  if (res.status === 401 || res.status === 403) {
    return new DriveUploadError("Google Drive menolak akses — hubungkan ulang Drive.");
  }
  return new DriveUploadError(`Google Drive menolak permintaan (${res.status}).`);
}

/** Folder backup masih ada (tidak dihapus / dibuang ke sampah)? */
async function folderExists(userId: string, folderId: string): Promise<boolean> {
  const res = await driveFetch(userId, `${API()}/files/${encodeURIComponent(folderId)}?fields=id,trashed`);
  if (res.status === 404) return false;
  if (!res.ok) throw await failure(res);
  const file = (await res.json()) as { trashed?: boolean };
  return !file.trashed;
}

/** id folder "UangLapangan Backup" milik pengguna — dicari, atau dibuat bila belum ada. */
export async function ensureBackupFolder(userId: string, knownId: string | null): Promise<string> {
  if (knownId && (await folderExists(userId, knownId))) return knownId;

  // drive.file hanya melihat file buatan aplikasi ini, jadi folder lain bernama sama tidak ikut.
  const q = `name = '${DRIVE_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const list = await driveFetch(userId, `${API()}/files?${new URLSearchParams({ q, fields: "files(id)", spaces: "drive" })}`);
  if (!list.ok) throw await failure(list);
  const found = ((await list.json()) as { files?: { id: string }[] }).files?.[0]?.id;

  const id =
    found ??
    (await (async () => {
      const res = await driveFetch(userId, `${API()}/files?fields=id`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: FOLDER_MIME }),
      });
      if (!res.ok) throw await failure(res);
      return ((await res.json()) as { id: string }).id;
    })());
  await setDriveFolder(userId, id);
  return id;
}

export type UploadedArchive = { driveFileId: string };

/**
 * Unggah satu arsip ke folder backup pengguna. Mengembalikan null untuk koneksi simulasi
 * (arsip tetap di server, tidak ada yang diunggah).
 */
export async function uploadArchiveToDrive(
  userId: string,
  archive: { archiveId: string; fileName: string; bytes: Buffer; checksum: string; sourceRev: number },
): Promise<UploadedArchive | null> {
  const target = await getDriveTarget(userId);
  if (!target) throw new DriveNotConnectedError("Google Drive belum terhubung.");
  if (target.mode === "simulasi") return null;

  const folderId = await ensureBackupFolder(userId, target.folderId);
  const metadata = {
    name: archive.fileName,
    parents: [folderId],
    mimeType: "application/zip",
    description: "Arsip backup UangLapangan — jangan diubah bila ingin dipulihkan lewat aplikasi.",
    // Penanda untuk mengenali arsip saat memulihkan / membersihkan versi lama.
    appProperties: {
      uanglapangan: "backup",
      archiveId: archive.archiveId,
      sha256: archive.checksum,
      sourceRev: String(archive.sourceRev),
    },
  };

  // 1) buka sesi unggah resumable, 2) kirim isinya.
  const start = await driveFetch(userId, `${UPLOAD()}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": "application/zip",
      "x-upload-content-length": String(archive.bytes.byteLength),
    },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) throw await failure(start);
  const session = start.headers.get("location");
  if (!session) throw new DriveUploadError("Google Drive tidak memberi alamat unggah.");

  const put = await driveFetch(userId, `${session}${session.includes("?") ? "&" : "?"}fields=id,size,md5Checksum`, {
    method: "PUT",
    headers: { "content-type": "application/zip" },
    body: new Uint8Array(archive.bytes),
  });
  if (!put.ok) throw await failure(put);
  const file = (await put.json()) as { id: string; size?: string; md5Checksum?: string };

  const md5 = createHash("md5").update(archive.bytes).digest("hex");
  if (file.md5Checksum && file.md5Checksum !== md5) {
    // Salinan rusak jangan dibiarkan di Drive pengguna (bisa terpilih saat memulihkan).
    await driveFetch(userId, `${API()}/files/${encodeURIComponent(file.id)}`, { method: "DELETE" }).catch(() => {});
    throw new DriveUploadError("Arsip rusak saat diunggah (checksum tidak cocok). Akan dicoba lagi.");
  }
  return { driveFileId: file.id };
}

/** Unduh isi satu file dari Drive pengguna (arsip untuk dipulihkan). */
export async function downloadDriveFile(userId: string, fileId: string): Promise<Buffer> {
  const res = await driveFetch(userId, `${API()}/files/${encodeURIComponent(fileId)}?alt=media`);
  if (res.status === 404) {
    throw new DriveUploadError("Arsip tidak ditemukan di Google Drive (mungkin sudah dihapus).");
  }
  if (!res.ok) throw await failure(res);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Hapus satu file dari Drive pengguna (retensi arsip). true = terhapus atau memang sudah tidak
 * ada; false = gagal (dicoba lagi nanti).
 */
export async function deleteDriveFile(userId: string, fileId: string): Promise<boolean> {
  try {
    const res = await driveFetch(userId, `${API()}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
