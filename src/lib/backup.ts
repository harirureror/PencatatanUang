export type BackupStatus = "proses" | "berhasil" | "gagal";
export type BackupTrigger = "terjadwal" | "manual";

/** Satu arsip backup (metadata — isinya di Google Drive pengguna). */
export type BackupArchive = {
  id: string;
  /** Waktu backup dimulai (ISO). */
  createdAt: string;
  completedAt: string | null;
  trigger: BackupTrigger;
  status: BackupStatus;
  fileName: string;
  sizeBytes: number;
  /** SHA-256 isi arsip, diperiksa sebelum memulihkan. */
  checksum: string | null;
  projectCount: number;
  transactionCount: number;
  receiptCount: number;
  /**
   * Tempat arsip disimpan: "drive" = di Google Drive pengguna; "server" = hanya di server
   * (koneksi simulasi); null = tidak ada file (gagal / masih berjalan).
   */
  location: "drive" | "server" | null;
  /** Alasan bila gagal. */
  error?: string;
};

/** Jumlah versi backup berhasil yang disimpan; yang lebih lama dihapus otomatis. */
export const KEEP_BACKUP_VERSIONS = 7;

/** Kata yang harus diketik pengguna sebelum memulihkan data dari arsip (mencegah salah tekan). */
export const RESTORE_CONFIRM_WORD = "PULIHKAN";
