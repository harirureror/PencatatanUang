// Penyimpanan berkas (foto struk, arsip backup sementara) dengan dua driver:
// - "r2"    : Cloudflare R2 (API kompatibel S3) — aktif bila R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
//             R2_SECRET_ACCESS_KEY, dan R2_BUCKET diisi. Bucket PRIVAT: berkas hanya dibaca lewat
//             API aplikasi yang memeriksa pemiliknya. Wajib untuk hosting serverless (Vercel), yang
//             disknya tidak permanen.
// - "local" : folder di server (pengembangan / VPS), di bawah STORAGE_DIR (bawaan ./data).
// Kunci berkas selalu dibentuk dari id buatan server (mis. "receipts/<trx>/<id>.jpg").
import { mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AwsClient } from "aws4fetch";

export type StorageDriver = "local" | "r2";

/** Berkas dengan kunci yang sama sudah ada (berkas tidak pernah ditimpa). */
export class ObjectExistsError extends Error {
  constructor(key: string) {
    super(`Berkas sudah ada: ${key}`);
  }
}

const KEY_PATTERN = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

function assertKey(key: string) {
  if (!KEY_PATTERN.test(key) || key.split("/").some((part) => part === "." || part === "..")) {
    throw new Error(`Kunci berkas tidak valid: ${key}`);
  }
}

// ---- Driver R2 ----------------------------------------------------------------------------

type R2Config = { endpoint: string; bucket: string; client: AwsClient };

let r2: R2Config | null | undefined;
function r2Config(): R2Config | null {
  if (r2 !== undefined) return r2;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return (r2 = null);
  r2 = {
    // R2_ENDPOINT bisa diganti untuk uji / penyedia S3 lain.
    endpoint: (process.env.R2_ENDPOINT ?? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).replace(/\/$/, ""),
    bucket: R2_BUCKET,
    client: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    }),
  };
  return r2;
}

export function storageDriver(): StorageDriver {
  return r2Config() ? "r2" : "local";
}

const objectUrl = (c: R2Config, key: string) =>
  `${c.endpoint}/${c.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

/**
 * Kirim request bertanda tangan ke R2. Tanda tangan dibuat aws4fetch, tetapi pengirimannya
 * dilakukan sendiri dengan isi berkas UTUH + Content-Length eksplisit: bila Request hasil
 * aws4fetch dikirim apa adanya, isinya menjadi stream dan (di runtime serverless) terkirim
 * "chunked" tanpa ukuran — R2 menolaknya dengan 411 MissingContentLength.
 */
async function r2Request(
  c: R2Config,
  method: string,
  key: string,
  init: { body?: Uint8Array; headers?: Record<string, string> } = {},
): Promise<Response> {
  const url = objectUrl(c, key);
  const body = init.body ? new Uint8Array(init.body) : undefined;
  const signed = await c.client.sign(url, {
    method,
    headers: {
      ...init.headers,
      // Isi tidak ikut ditandatangani (HTTPS yang menjaga keutuhannya) → tidak perlu membaca stream.
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    },
  });
  const headers = new Headers(signed.headers);
  if (body) headers.set("content-length", String(body.byteLength));
  return fetch(url, { method, headers, body });
}

// ---- Driver lokal -------------------------------------------------------------------------

const LOCAL_ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./data");

function localPath(key: string): string {
  const full = path.resolve(LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error(`Kunci berkas tidak valid: ${key}`);
  return full;
}

// ---- API ----------------------------------------------------------------------------------

/** Simpan berkas baru. Melempar ObjectExistsError bila kunci sudah dipakai. */
export async function putObject(
  key: string,
  bytes: Uint8Array,
  { contentType = "application/octet-stream", overwrite = false } = {},
): Promise<void> {
  assertKey(key);
  const c = r2Config();
  if (c) {
    const put = (conditional: boolean) =>
      r2Request(c, "PUT", key, {
        body: bytes,
        headers: {
          "content-type": contentType,
          // Tolak di sisi R2 bila sudah ada (atomik, tanpa cek-lalu-tulis).
          ...(conditional ? { "if-none-match": "*" } : {}),
        },
      });
    let res = await put(!overwrite);
    // Penyedia yang tidak mendukung PUT bersyarat (501 / 400 InvalidRequest untuk header itu):
    // cek keberadaan dulu lalu tulis biasa. Kunci selalu id acak baru, jadi risikonya kecil.
    if (!overwrite && (res.status === 501 || res.status === 400)) {
      const head = await r2Request(c, "HEAD", key);
      if (head.ok) throw new ObjectExistsError(key);
      res = await put(false);
    }
    if (res.status === 412) throw new ObjectExistsError(key);
    if (!res.ok) throw new Error(`R2 PUT ${key} gagal: ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
    return;
  }
  const full = localPath(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  try {
    await writeFile(/*turbopackIgnore: true*/ full, bytes, { flag: overwrite ? "w" : "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ObjectExistsError(key);
    throw error;
  }
}

/** Isi berkas, atau null bila tidak ada. */
export async function getObject(key: string): Promise<Buffer | null> {
  assertKey(key);
  const c = r2Config();
  if (c) {
    const res = await r2Request(c, "GET", key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 GET ${key} gagal: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  try {
    return await readFile(/*turbopackIgnore: true*/ localPath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Hapus berkas (tidak galat bila sudah tidak ada). Driver lokal ikut merapikan folder kosong. */
export async function deleteObject(key: string): Promise<void> {
  assertKey(key);
  const c = r2Config();
  if (c) {
    const res = await r2Request(c, "DELETE", key);
    if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${key} gagal: ${res.status}`);
    return;
  }
  const full = localPath(key);
  await rm(/*turbopackIgnore: true*/ full, { force: true });
  await rmdir(/*turbopackIgnore: true*/ path.dirname(full)).catch(() => {}); // masih ada isi → biarkan
}

/**
 * Uji penyimpanan: tulis → baca → hapus satu berkas kecil. Untuk halaman diagnostik — tidak
 * pernah mengembalikan nilai rahasia, hanya driver, nama bucket, dan pesan galat penyedia.
 */
export async function checkStorage(): Promise<{ driver: StorageDriver; bucket: string | null; ok: boolean; error?: string }> {
  const driver = storageDriver();
  const bucket = r2Config()?.bucket ?? null;
  const key = `diagnostik/uji-${Date.now()}.bin`;
  try {
    // Seukuran foto struk (256 KB): berkas beberapa byte bisa lolos padahal unggahan besar gagal.
    const sample = new Uint8Array(256 * 1024).map((_, i) => i % 251);
    await putObject(key, sample, { contentType: "application/octet-stream" });
    const back = await getObject(key);
    await deleteObject(key);
    if (!back || back.length !== sample.length || back[1000] !== sample[1000]) {
      return { driver, bucket, ok: false, error: "Berkas yang dibaca tidak sama dengan yang ditulis." };
    }
    return { driver, bucket, ok: true };
  } catch (error) {
    return { driver, bucket, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
