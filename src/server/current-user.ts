// Pengguna yang sedang memakai aplikasi = pemilik sesi Better Auth. Semua data (proyek,
// transaksi, struk, backup, …) disaring dengan id ini, jadi tiap akun hanya melihat datanya.
import { headers } from "next/headers";

import { getSessionUser } from "@/server/session";

export { DEMO_USER_ID } from "@/db/demo";

/**
 * Header internal berisi id pengguna yang sudah diverifikasi proxy (src/proxy.ts). Proxy selalu
 * menghapus header ini dari request luar sebelum mengisinya, jadi tidak bisa dipalsukan klien.
 */
export const USER_ID_HEADER = "x-uanglapangan-user-id";

export class NotSignedInError extends Error {
  constructor() {
    super("Belum masuk.");
  }
}

/** ID pengguna yang sedang masuk. Melempar NotSignedInError bila tidak ada sesi yang sah. */
export async function getCurrentUserId(): Promise<string> {
  const h = await headers();
  const verified = h.get(USER_ID_HEADER);
  if (verified) return verified;
  // Rute di luar jangkauan proxy: periksa sesi langsung.
  const user = await getSessionUser(h);
  if (!user) throw new NotSignedInError();
  return user.id;
}
