// Membaca sesi masuk di server (route handler, server component, server action).
import { headers } from "next/headers";

import { auth, isPhoneEmail } from "@/server/auth";

export type SessionUser = { id: string; name: string; email: string | null; phone: string | null };

/** Bentuk pengguna untuk klien: email pengganti akun nomor HP tidak ditampilkan. */
export function toSessionUser(user: { id: string; name: string; email: string; phoneNumber?: string | null }): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: isPhoneEmail(user.email) ? null : user.email,
    phone: user.phoneNumber ?? null,
  };
}

/** Pengguna yang sedang masuk (dari cookie sesi bertanda tangan), atau null. */
export async function getSessionUser(requestHeaders?: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: requestHeaders ?? (await headers()) });
  return session ? toSessionUser(session.user) : null;
}
