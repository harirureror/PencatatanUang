// Panggilan akun dari browser ke /api/akun/* (lihat route handler masing-masing).
// Bentuk hasilnya dipakai langsung oleh form masuk / daftar / lupa sandi.
import type { NewPasswordErrors, SignInErrors, SignUpErrors, SignUpInput } from "@/lib/auth-rules";

export type AuthUser = { id: string; name: string; email: string | null; phone: string | null };

export type SignInResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error?: string; fieldErrors?: SignInErrors; retryAfter?: number };

export type SignUpResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error?: string; fieldErrors?: SignUpErrors; taken?: boolean; retryAfter?: number };

export type ResetRequestResult =
  | { ok: true; channel: "email" | "phone"; destination: string; retryAfter: number }
  | { ok: false; error: string; retryAfter?: number };

type Body = {
  data?: Record<string, unknown>;
  error?: string;
  fieldErrors?: Record<string, string>;
  taken?: boolean;
  expired?: boolean;
  retryAfter?: number;
};

async function post(path: string, payload: unknown): Promise<{ ok: boolean; body: Body }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "same-origin",
  });
  const body = (await res.json().catch(() => ({ error: "Server tidak menjawab dengan benar." }))) as Body;
  return { ok: res.ok, body };
}

export async function signIn(input: { identifier: string; password: string }): Promise<SignInResult> {
  const { ok, body } = await post("/api/akun/masuk", input);
  if (ok) return { ok: true, user: body.data!.user as AuthUser };
  return { ok: false, error: body.error, fieldErrors: body.fieldErrors, retryAfter: body.retryAfter };
}

export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const { ok, body } = await post("/api/akun/daftar", input);
  if (ok) return { ok: true, user: body.data!.user as AuthUser };
  return { ok: false, error: body.error, fieldErrors: body.fieldErrors, taken: body.taken, retryAfter: body.retryAfter };
}

export type ProfileSaveResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error?: string; fieldErrors?: Partial<Record<"name" | "email" | "phone" | "password", string>> };

/** Simpan profil (nama, email, nomor HP; sandi saat ini bila kontak berubah). */
export async function saveProfile(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<ProfileSaveResult> {
  const res = await fetch("/api/akun/profil", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  });
  const body = (await res.json().catch(() => ({ error: "Server tidak menjawab dengan benar." }))) as Body;
  if (res.ok) return { ok: true, user: body.data!.user as AuthUser };
  return { ok: false, error: body.error, fieldErrors: body.fieldErrors };
}

export async function signOut(): Promise<void> {
  await post("/api/akun/keluar", {});
}

/** Pengguna yang sedang masuk menurut server (null = belum / sesi berakhir). */
export async function fetchSessionUser(): Promise<AuthUser | null> {
  const res = await fetch("/api/akun/sesi", { cache: "no-store", credentials: "same-origin" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Sesi tidak bisa diperiksa (${res.status}).`);
  return ((await res.json()) as { data: { user: AuthUser } }).data.user;
}

export async function requestReset(identifier: string): Promise<ResetRequestResult> {
  const { ok, body } = await post("/api/akun/lupa-sandi", { identifier });
  if (ok) {
    const d = body.data as { channel: "email" | "phone"; destination: string; retryAfter: number };
    return { ok: true, ...d };
  }
  return { ok: false, error: body.error ?? "Gagal mengirim. Coba lagi.", retryAfter: body.retryAfter };
}

export async function verifyResetCode(
  identifier: string,
  code: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const { ok, body } = await post("/api/akun/lupa-sandi/kode", { identifier, code });
  return ok ? { ok: true, token: String(body.data!.token) } : { ok: false, error: body.error ?? "Kode salah." };
}

export async function resetPassword(
  token: string,
  password: string,
  confirm: string,
): Promise<{ ok: true; account: string } | { ok: false; error?: string; expired?: boolean; fieldErrors?: NewPasswordErrors }> {
  const { ok, body } = await post("/api/akun/atur-ulang-sandi", { token, password, confirm });
  if (ok) return { ok: true, account: String(body.data!.account) };
  return { ok: false, error: body.error, expired: body.expired, fieldErrors: body.fieldErrors };
}
