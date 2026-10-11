// Salin seluruh data aplikasi utama (VPS: database file + folder data/) ke SALINAN (database
// Turso + bucket R2 yang dibuka lewat Vercel), atau sebaliknya. Lihat docs/DEPLOY-VPS.md.
//
//   node --env-file=.env.production scripts/salin-data.mjs --uji          # laporan saja
//   node --env-file=.env.production scripts/salin-data.mjs [--timpa]      # utama → salinan
//   node --env-file=.env.production scripts/salin-data.mjs --arah dari-salinan --timpa
//
// Env utama   : DATABASE_URL (bawaan file:./data/uanglapangan.db), STORAGE_DIR / R2_*
// Env salinan : MIRROR_DATABASE_URL, MIRROR_DATABASE_AUTH_TOKEN, MIRROR_R2_ACCOUNT_ID,
//               MIRROR_R2_ACCESS_KEY_ID, MIRROR_R2_SECRET_ACCESS_KEY, MIRROR_R2_BUCKET
//               (MIRROR_STORAGE_DIR sebagai ganti R2 — untuk uji)
//
// Database tujuan diganti dalam SATU transaksi: berhasil semua atau tidak berubah sama sekali.
// Pengaman: tujuan yang sudah berubah sejak penyalinan terakhir (ada yang mencatat di sana)
// tidak ditimpa kecuali diberi --timpa. Nilai env tidak pernah dicetak.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { r2FromEnv } from "./lib/r2.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const META = "_mirror_meta";
/** Milik tujuan sendiri — tidak pernah disentuh. */
const UNTOUCHED = new Set(["verifications", "rate_limits", "__drizzle_migrations", META]);
/** Milik perangkat yang masuk di tujuan — dipertahankan untuk pengguna yang masih ada. */
const KEPT = ["sessions", "sync_devices"];
const CHUNK = 50;
const CONTENT_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

/** Galat yang pesannya ditujukan ke orang yang menjalankan skrip. */
export class SalinError extends Error {}

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

function localStorage(dir) {
  const root = path.resolve(ROOT, dir);
  const full = (key) => path.join(root, ...key.split("/"));
  return {
    label: `folder ${path.relative(ROOT, root) || "."}`,
    async has(key) {
      return (await this.get(key)) !== null;
    },
    async get(key) {
      try {
        return await readFile(full(key));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async put(key, bytes) {
      await mkdir(path.dirname(full(key)), { recursive: true });
      try {
        await writeFile(full(key), bytes, { flag: "wx" });
        return true;
      } catch (error) {
        if (error.code === "EEXIST") return false;
        throw error;
      }
    },
  };
}

/** Dua sisi penyalinan dari env: { utama, salinan }, masing-masing { db(), storage, label }. */
function endpoints() {
  const mirrorUrl = process.env.MIRROR_DATABASE_URL;
  if (!mirrorUrl) throw new SalinError("MIRROR_DATABASE_URL belum diisi (alamat database salinan / Turso).");
  const mirrorStorage = process.env.MIRROR_STORAGE_DIR ? localStorage(process.env.MIRROR_STORAGE_DIR) : r2FromEnv("MIRROR_");
  if (!mirrorStorage) {
    throw new SalinError("MIRROR_R2_ACCOUNT_ID, MIRROR_R2_ACCESS_KEY_ID, MIRROR_R2_SECRET_ACCESS_KEY, MIRROR_R2_BUCKET belum lengkap.");
  }
  const mainUrl = process.env.DATABASE_URL || "file:./data/uanglapangan.db";
  if (mainUrl === mirrorUrl) throw new SalinError("DATABASE_URL dan MIRROR_DATABASE_URL sama — tidak ada yang perlu disalin.");
  return {
    utama: {
      label: "aplikasi utama",
      db: () => createClient({ url: mainUrl, authToken: process.env.DATABASE_AUTH_TOKEN }),
      storage: r2FromEnv() ?? localStorage(process.env.STORAGE_DIR ?? "./data"),
    },
    salinan: {
      label: "salinan",
      db: () => createClient({ url: mirrorUrl, authToken: process.env.MIRROR_DATABASE_AUTH_TOKEN }),
      storage: mirrorStorage,
    },
  };
}

async function tableNames(db) {
  const res = await db.execute("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name");
  return res.rows.map((r) => String(r.name));
}

/** "tabel: kolom tipe, …" per tabel — untuk membandingkan skema dua database. */
async function schemaSignature(db, tables) {
  const out = {};
  for (const t of tables) {
    const info = await db.execute(`pragma table_info(${q(t)})`);
    out[t] = info.rows.map((r) => `${r.name} ${String(r.type).toUpperCase()}`).join(", ");
  }
  return out;
}

/** Urutan induk → anak menurut foreign key (anak selalu setelah semua induknya). */
async function parentFirst(db, tables) {
  const parents = new Map();
  for (const t of tables) {
    const fk = await db.execute(`pragma foreign_key_list(${q(t)})`);
    parents.set(t, new Set(fk.rows.map((r) => String(r.table)).filter((p) => p !== t && tables.includes(p))));
  }
  const order = [];
  const left = new Set(tables);
  while (left.size > 0) {
    const ready = [...left].filter((t) => [...parents.get(t)].every((p) => !left.has(p)));
    if (ready.length === 0) throw new SalinError(`Relasi antartabel melingkar: ${[...left].join(", ")}`);
    for (const t of ready.sort()) {
      order.push(t);
      left.delete(t);
    }
  }
  return order;
}

async function count(db, table) {
  return Number((await db.execute(`select count(*) as n from ${q(table)}`)).rows[0].n);
}

async function hasTable(db, table) {
  return (await db.execute({ sql: "select 1 from sqlite_master where type = 'table' and name = ?", args: [table] })).rows.length > 0;
}

async function counter(db) {
  if (!(await hasTable(db, "sync_counter"))) return 0;
  return Number((await db.execute("select value from sync_counter where id = 1")).rows[0]?.value ?? 0);
}

/** Catatan penyalinan terakhir di sebuah database salinan, atau null. */
export async function readMeta(db) {
  if (!(await hasTable(db, META))) return null;
  const row = (await db.execute(`select copied_at, counter from ${META} where id = 1`)).rows[0];
  return row ? { copiedAt: String(row.copied_at), counter: Number(row.counter) } : null;
}

const META_DDL = `create table if not exists ${META} (id integer primary key check (id = 1), copied_at text not null, counter integer not null)`;
const metaUpsert = (copiedAt, value) => ({
  sql: `insert into ${META} (id, copied_at, counter) values (1, ?, ?) on conflict (id) do update set copied_at = excluded.copied_at, counter = excluded.counter`,
  args: [copiedAt, value],
});

function insertStatements(table, columns, rows) {
  const statements = [];
  const cols = columns.map(q).join(", ");
  const one = `(${columns.map(() => "?").join(", ")})`;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    statements.push({
      sql: `insert into ${q(table)} (${cols}) values ${chunk.map(() => one).join(", ")}`,
      args: chunk.flatMap((row) => columns.map((_, c) => row[c])),
    });
  }
  return statements;
}

async function copyFiles(source, target, keys, dryRun, log) {
  const stats = { diperiksa: keys.length, disalin: 0, sudahAda: 0, hilangDiSumber: 0 };
  for (const key of keys) {
    if (await target.storage.has(key)) {
      stats.sudahAda++;
      continue;
    }
    if (dryRun) {
      stats.disalin++;
      continue;
    }
    const bytes = await source.storage.get(key);
    if (!bytes) {
      stats.hilangDiSumber++;
      log(`! berkas tidak ada di ${source.label}: ${key}`);
      continue;
    }
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    await target.storage.put(key, bytes, CONTENT_TYPES[ext]);
    stats.disalin++;
  }
  return stats;
}

/**
 * Jalankan penyalinan. arah: "ke-salinan" (utama → salinan) atau "dari-salinan".
 * uji: hanya laporan. timpa: izinkan mengganti tujuan yang sudah berubah.
 */
export async function salin({ arah = "ke-salinan", uji = false, timpa = false, log = console.log } = {}) {
  if (arah !== "ke-salinan" && arah !== "dari-salinan") throw new SalinError("--arah harus ke-salinan atau dari-salinan.");
  const sides = endpoints();
  const [source, target] = arah === "ke-salinan" ? [sides.utama, sides.salinan] : [sides.salinan, sides.utama];
  const src = source.db();
  const dst = target.db();
  try {
    log(`→ ${source.label} → ${target.label}${uji ? " (uji, tanpa menulis)" : ""}`);

    // 1. Skema tujuan disamakan dulu, lalu dipastikan sama.
    if (!uji) await migrate(drizzle(dst), { migrationsFolder: path.join(ROOT, "drizzle") });
    const tables = (await tableNames(src)).filter((t) => !UNTOUCHED.has(t));
    const [a, b] = [await schemaSignature(src, tables), await schemaSignature(dst, tables)];
    const different = tables.filter((t) => a[t] !== b[t]);
    if (different.length > 0 && !uji) {
      throw new SalinError(
        `Susunan tabel berbeda (${different.join(", ")}). Jalankan pembaruan aplikasi di kedua sisi sampai versinya sama.`,
      );
    }
    if (different.length > 0) log(`  ! susunan tabel ${target.label} tertinggal — akan disamakan (migrasi) saat penyalinan sungguhan`);

    // 2. Pengaman: jangan menimpa tujuan yang berubah sejak penyalinan terakhir.
    const targetUsers = (await hasTable(dst, "users")) ? await count(dst, "users") : 0;
    const targetMeta = arah === "ke-salinan" ? await readMeta(dst) : null;
    const untouched = targetMeta !== null && targetMeta.counter === (await counter(dst));
    if (targetUsers > 0 && !untouched && !timpa) {
      const reason =
        arah === "ke-salinan"
          ? "Salinan berisi data yang bukan hasil penyalinan terakhir (belum pernah disalin, atau ada yang mencatat di sana — mungkin sedang dipakai sebagai aplikasi utama). Tambahkan --timpa bila memang ingin menggantinya dengan data aplikasi utama."
          : "Arah dari-salinan mengganti seluruh data aplikasi utama. Hentikan aplikasinya dulu, lalu tambahkan --timpa.";
      if (!uji) throw new SalinError(reason);
      log(`  ! ${reason}`);
    }
    if (targetUsers > 0) log(`  ${target.label} sekarang berisi ${targetUsers} akun — isinya akan DIGANTI`);

    // Baca sumber.
    const order = await parentFirst(src, tables);
    const data = new Map();
    for (const t of order) {
      if (KEPT.includes(t)) continue;
      const res = await src.execute(`select * from ${q(t)}`);
      data.set(t, { columns: res.columns, rows: res.rows });
    }
    const triggers = (await src.execute("select name, sql from sqlite_master where type = 'trigger' and sql is not null order by name")).rows;
    const sourceCounter = await counter(src);
    const report = Object.fromEntries([...data].map(([t, d]) => [t, d.rows.length]));
    log(`  baris: ${Object.entries(report).map(([t, n]) => `${t} ${n}`).join(" · ")}`);

    const keys = (data.get("receipts")?.rows ?? [])
      .map((r) => String(r.file_url))
      .filter((u) => !u.startsWith("/") && !/^[a-z]+:/i.test(u))
      .map((u) => `receipts/${u}`);

    if (uji) {
      const files = await copyFiles(source, target, keys, true, log);
      log(`  berkas: ${files.diperiksa} diperiksa, ${files.disalin} perlu disalin, ${files.sudahAda} sudah ada`);
      log("✓ Uji selesai — tidak ada yang diubah.");
      return { arah, uji: true, baris: report, berkas: files };
    }

    // Berkas dulu: bila terputus di tengah, database tujuan belum menunjuk ke foto yang belum ada.
    const files = await copyFiles(source, target, keys, false, log);
    log(`  berkas: ${files.disalin} disalin, ${files.sudahAda} sudah ada${files.hilangDiSumber ? `, ${files.hilangDiSumber} tidak ditemukan` : ""}`);

    // 3–6. Ganti isi database tujuan dalam satu transaksi.
    const copiedAt = new Date().toISOString();
    const tx = await dst.transaction("write");
    try {
      const kept = new Map();
      for (const t of KEPT) {
        if (!tables.includes(t)) continue;
        const res = await tx.execute(`select * from ${q(t)}`);
        kept.set(t, { columns: res.columns, rows: res.rows });
      }
      const oldTriggers = (await tx.execute("select name from sqlite_master where type = 'trigger'")).rows;
      for (const r of oldTriggers) await tx.execute(`drop trigger ${q(r.name)}`);
      await tx.batch([...order].reverse().map((t) => `delete from ${q(t)}`));
      for (const t of order) {
        if (KEPT.includes(t)) {
          const { columns, rows } = kept.get(t);
          const userCol = columns.indexOf("user_id");
          const userIds = new Set((data.get("users")?.rows ?? []).map((r) => String(r.id)));
          const alive = rows.filter((r) => userIds.has(String(r[userCol])));
          for (const stmt of insertStatements(t, columns, alive)) await tx.execute(stmt);
          continue;
        }
        const { columns, rows } = data.get(t);
        for (const stmt of insertStatements(t, columns, rows)) await tx.execute(stmt);
      }
      for (const r of triggers) await tx.execute(String(r.sql));
      if (arah === "ke-salinan") {
        await tx.execute(META_DDL);
        await tx.execute(metaUpsert(copiedAt, sourceCounter));
      }
      const broken = await tx.execute("pragma foreign_key_check");
      if (broken.rows.length > 0) throw new SalinError(`Relasi data tidak utuh setelah disalin (${broken.rows.length} baris) — dibatalkan.`);
      await tx.commit();
    } catch (error) {
      await tx.rollback().catch(() => {});
      throw error;
    }

    // Arah balik: salinan kini sama dengan utama lagi → tandai agar penyalinan harian lanjut.
    if (arah === "dari-salinan") {
      await src.execute(META_DDL);
      await src.execute(metaUpsert(copiedAt, sourceCounter));
    }
    log(`✓ Selesai ${copiedAt}`);
    return { arah, uji: false, baris: report, berkas: files, copiedAt };
  } finally {
    src.close();
    dst.close();
  }
}

/** Waktu penyalinan terakhir yang tercatat di salinan (ISO), atau null. */
export async function terakhirDisalin() {
  const db = endpoints().salinan.db();
  try {
    return (await readMeta(db))?.copiedAt ?? null;
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const arahIndex = args.indexOf("--arah");
  try {
    await salin({
      arah: arahIndex >= 0 ? args[arahIndex + 1] : "ke-salinan",
      uji: args.includes("--uji"),
      timpa: args.includes("--timpa"),
    });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}${cause}`);
    process.exit(1);
  }
}
