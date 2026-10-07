// Enkripsi rahasia yang disimpan di database (mis. refresh token Google Drive): AES-256-GCM.
// Kunci dari env DRIVE_TOKEN_KEY (string acak panjang, mis. `openssl rand -base64 32`).
// Format teks: v1.<iv>.<tag>.<ciphertext> (base64url). Bila database bocor tanpa kuncinya,
// token tetap tidak bisa dipakai.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const MIN_KEY_LENGTH = 32;
let warned = false;

export class SecretBoxConfigError extends Error {}

function key(): Buffer {
  const configured = process.env.DRIVE_TOKEN_KEY;
  if (configured && configured.length >= MIN_KEY_LENGTH) {
    return createHash("sha256").update(configured).digest();
  }
  if (process.env.NODE_ENV === "production") {
    throw new SecretBoxConfigError(
      `DRIVE_TOKEN_KEY belum diisi (minimal ${MIN_KEY_LENGTH} karakter acak).`,
    );
  }
  if (!warned) {
    warned = true;
    console.warn("DRIVE_TOKEN_KEY kosong — memakai kunci khusus pengembangan (jangan untuk produksi).");
  }
  // Kunci tetap (bukan acak) supaya token tersimpan tetap terbaca setelah server dev restart.
  return createHash("sha256").update("uanglapangan-dev-only-drive-token-key").digest();
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Buka rahasia; melempar galat bila kunci salah atau isinya diubah. */
export function open(sealed: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("Format rahasia tidak dikenal.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
