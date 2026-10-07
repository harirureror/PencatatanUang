// Aturan isian akun (masuk / daftar / atur ulang sandi) — fungsi murni, dipakai form di browser
// dan nanti divalidasi ulang di server.

export type Identifier = { kind: "email"; value: string } | { kind: "phone"; value: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Email (huruf kecil) atau nomor HP Indonesia dinormalkan ke +62… — "0812-3456-7890",
 * "62812…", dan "+62 812…" dianggap sama. Null bila bukan keduanya.
 */
export function parseIdentifier(raw: string): Identifier | null {
  const value = raw.trim();
  if (value.includes("@")) {
    const email = value.toLowerCase();
    return EMAIL.test(email) && email.length <= 254 ? { kind: "email", value: email } : null;
  }
  const digits = value.replace(/[\s().-]/g, "");
  const local = /^(?:\+?62|0)(8\d{7,12})$/.exec(digits)?.[1];
  return local ? { kind: "phone", value: `+62${local}` } : null;
}

export const PASSWORD_MIN = 8;

export type SignInField = "identifier" | "password";
export type SignInErrors = Partial<Record<SignInField, string>>;

export function validateSignIn(input: { identifier: string; password: string }): SignInErrors {
  const errors: SignInErrors = {};
  if (!input.identifier.trim()) errors.identifier = "Isi email atau nomor HP.";
  else if (!parseIdentifier(input.identifier)) {
    errors.identifier = input.identifier.includes("@")
      ? "Format email belum benar, mis. nama@contoh.com."
      : "Nomor HP belum benar, mis. 0812 3456 7890.";
  }
  if (!input.password) errors.password = "Isi kata sandi.";
  return errors;
}

/**
 * Tujuan setelah masuk: hanya path internal ("/rekap?periode=…"), bukan URL luar atau
 * "//domain" (mencegah open redirect). Bawaan: dashboard.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value.startsWith("/masuk") ? "/" : value;
}

export const NAME_MAX = 60;

/** Syarat kata sandi baru, ditampilkan sebagai daftar periksa saat mengetik. */
export function passwordChecks(password: string): { label: string; ok: boolean }[] {
  return [
    { label: `Minimal ${PASSWORD_MIN} karakter`, ok: password.length >= PASSWORD_MIN },
    { label: "Ada huruf", ok: /\p{L}/u.test(password) },
    { label: "Ada angka", ok: /\d/.test(password) },
  ];
}

export type SignUpField = "name" | "identifier" | "password" | "confirm";
export type SignUpErrors = Partial<Record<SignUpField, string>>;
export type SignUpInput = Record<SignUpField, string>;

export function validateSignUp(input: SignUpInput): SignUpErrors {
  const errors: SignUpErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "Isi nama kamu.";
  else if (name.length < 2) errors.name = "Nama terlalu pendek.";
  else if (name.length > NAME_MAX) errors.name = `Nama maksimal ${NAME_MAX} karakter.`;

  const { identifier: idError } = validateSignIn({ identifier: input.identifier, password: "x" });
  if (idError) errors.identifier = idError;

  return { ...errors, ...validateNewPassword(input.password, input.confirm, input.identifier) };
}

export type NewPasswordErrors = { password?: string; confirm?: string };

/** Kata sandi baru + ulangi (daftar akun & atur ulang sandi). */
export function validateNewPassword(password: string, confirm: string, identifier = ""): NewPasswordErrors {
  const errors: NewPasswordErrors = {};
  if (!password) errors.password = "Buat kata sandi.";
  else if (passwordChecks(password).some((c) => !c.ok)) {
    errors.password = `Kata sandi minimal ${PASSWORD_MIN} karakter dan berisi huruf serta angka.`;
  } else if (password.length > 128) errors.password = "Kata sandi maksimal 128 karakter.";
  else if (identifier && password.trim().toLowerCase() === identifier.trim().toLowerCase()) {
    errors.password = "Kata sandi jangan sama dengan email / nomor HP.";
  }
  if (!confirm) errors.confirm = "Ulangi kata sandi.";
  else if (confirm !== password) errors.confirm = "Kata sandi tidak sama.";
  return errors;
}

export const RESET_CODE_LENGTH = 6;

/** "+6281234567890" → "0812-3456-7890" (tampilan). */
export function formatPhone(e164: string): string {
  const local = e164.startsWith("+62") ? `0${e164.slice(3)}` : e164;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
}

export type ProfileField = "name" | "email" | "phone" | "password";
export type ProfileErrors = Partial<Record<ProfileField, string>> & { form?: string };
export type ProfileInput = Record<ProfileField, string>;

/**
 * Validasi form profil. `current` = kontak tersimpan (untuk tahu apakah email/HP berubah —
 * mengubah kontak masuk butuh sandi saat ini).
 */
export function validateProfile(input: ProfileInput, current: { email: string | null; phone: string | null }): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "Isi nama kamu.";
  else if (name.length < 2) errors.name = "Nama terlalu pendek.";
  else if (name.length > NAME_MAX) errors.name = `Nama maksimal ${NAME_MAX} karakter.`;

  const email = input.email.trim();
  const phone = input.phone.trim();
  if (email && parseIdentifier(email)?.kind !== "email") errors.email = "Format email belum benar, mis. nama@contoh.com.";
  if (phone && parseIdentifier(phone)?.kind !== "phone") errors.phone = "Nomor HP belum benar, mis. 0812 3456 7890.";
  if (!email && !phone) errors.form = "Isi minimal satu: email atau nomor HP (dipakai untuk masuk).";

  if (contactChanged(input, current) && !input.password) {
    errors.password = "Masukkan sandi saat ini untuk mengganti email / nomor HP.";
  }
  return errors;
}

/** Email / nomor HP berubah dibanding yang tersimpan (setelah dinormalkan). */
export function contactChanged(input: Pick<ProfileInput, "email" | "phone">, current: { email: string | null; phone: string | null }): boolean {
  const norm = (v: string) => (v.trim() ? (parseIdentifier(v)?.value ?? v.trim().toLowerCase()) : null);
  return norm(input.email) !== (current.email ?? null) || norm(input.phone) !== (current.phone ?? null);
}
