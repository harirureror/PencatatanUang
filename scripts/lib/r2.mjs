// Klien kecil Cloudflare R2 (API S3) untuk skrip. Pola yang sama dengan src/server/object-storage.ts:
// tanda tangan dibuat aws4fetch, tetapi pengirimannya dilakukan sendiri dengan isi berkas utuh +
// Content-Length eksplisit — bila tidak, isi terkirim "chunked" dan R2 menolak (411).
import { AwsClient } from "aws4fetch";

/**
 * Baca konfigurasi R2 dari env dengan awalan tertentu ("" → R2_*, "MIRROR_" → MIRROR_R2_*).
 * Null bila belum diisi lengkap.
 */
export function r2FromEnv(prefix = "") {
  const get = (name) => process.env[`${prefix}R2_${name}`];
  const accountId = get("ACCOUNT_ID");
  const accessKeyId = get("ACCESS_KEY_ID");
  const secretAccessKey = get("SECRET_ACCESS_KEY");
  const bucket = get("BUCKET");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const endpoint = (get("ENDPOINT") ?? `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/$/, "");
  const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const objectUrl = (key) => `${endpoint}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  async function request(method, key, { body, headers } = {}) {
    const url = objectUrl(key);
    const bytes = body ? new Uint8Array(body) : undefined;
    const signed = await client.sign(url, { method, headers: { ...headers, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" } });
    const out = new Headers(signed.headers);
    if (bytes) out.set("content-length", String(bytes.byteLength));
    return fetch(url, { method, headers: out, body: bytes });
  }

  return {
    label: `R2 bucket ${bucket}`,
    /** true bila berkas ada. */
    async has(key) {
      const res = await request("HEAD", key);
      if (res.ok) return true;
      if (res.status === 404) return false;
      throw new Error(`R2 HEAD ${key} gagal: ${res.status}`);
    },
    /** Isi berkas, atau null bila tidak ada. */
    async get(key) {
      const res = await request("GET", key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 GET ${key} gagal: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    /** Simpan berkas baru; mengembalikan false bila sudah ada (tidak ditimpa). */
    async put(key, bytes, contentType = "application/octet-stream") {
      const res = await request("PUT", key, { body: bytes, headers: { "content-type": contentType, "if-none-match": "*" } });
      if (res.status === 412) return false;
      if (!res.ok) throw new Error(`R2 PUT ${key} gagal: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return true;
    },
  };
}
