// Data di perangkat (replica, antrean offline, token & id perangkat sinkron) milik SATU akun.
// Saat keluar atau saat akun lain masuk di perangkat yang sama, semuanya dihapus supaya data
// akun sebelumnya tidak terlihat — dan perubahan yang belum terkirim tidak ikut terkirim
// sebagai milik akun baru.
import { DEMO_USER_ID } from "@/db/demo";
import { forgetDeviceId } from "@/lib/local/device";
import { forgetSyncToken } from "@/lib/local/hub-client";
import { wipeDeviceData } from "@/lib/local/replica-store";

const OWNER_KEY = "uanglapangan:pemilik-data";

function readOwner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(userId: string | null) {
  try {
    if (userId) window.localStorage.setItem(OWNER_KEY, userId);
    else window.localStorage.removeItem(OWNER_KEY);
  } catch {
    // penyimpanan diblokir — data perangkat juga tidak tersimpan
  }
}

/** Hapus semua data akun dari perangkat ini (dipanggil saat keluar). */
export async function clearLocalAccountData(): Promise<void> {
  forgetSyncToken();
  await wipeDeviceData();
  forgetDeviceId();
  writeOwner(null);
}

/**
 * Pastikan data perangkat milik `userId`: bila sebelumnya milik akun lain, hapus dulu.
 * True bila ada yang dihapus.
 */
export async function claimLocalData(userId: string): Promise<boolean> {
  const owner = readOwner();
  if (owner === userId) return false;
  // Data dari versi sebelum ada akun selalu milik akun demo — tidak perlu dihapus.
  if (owner === null && userId === DEMO_USER_ID) {
    writeOwner(userId);
    return false;
  }
  await clearLocalAccountData();
  writeOwner(userId);
  return true;
}
