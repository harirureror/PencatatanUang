// Gabungkan data SATU akun dari salinan (Vercel: Turso + R2) ke aplikasi utama (VPS), untuk akun
// dengan email yang sama di kedua sisi. Lihat docs/DEPLOY-VPS.md.
//
//   node --env-file=.env.production scripts/salin-akun.mjs --email orang@contoh.com --uji   # laporan saja
//   node --env-file=.env.production scripts/salin-akun.mjs --email orang@contoh.com
//
// Env sama dengan scripts/salin-data.mjs (DATABASE_URL / STORAGE_DIR untuk VPS, MIRROR_* untuk Vercel).
//
// Aturan gabung, per baris (proyek, kategori buatan, transaksi, lampiran, pengaturan):
// - hanya ada di Vercel → ditambahkan ke VPS (yang sudah terhapus di Vercel tidak ikut);
// - ada di keduanya → updated_at yang lebih baru menang;
// - hanya ada di VPS → tidak disentuh.
// Akun & sandi VPS, sesi, perangkat, riwayat backup, koneksi Drive, pemberitahuan: tidak disentuh.
// Baris yang berubah mendapat rev baru (trigger), jadi perangkat ikut menariknya saat sinkron.
// Semua perubahan database dalam SATU transaksi: berhasil semua atau tidak berubah sama sekali.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { copyFiles, endpoints, q, SalinError, schemaSignature } from "./salin-data.mjs";

const TABLES = ["users", "projects", "categories", "transactions", "receipts", "settings"];
/** Kolom yang tidak pernah disalin apa adanya: rev diisi trigger tujuan, pemilik dipetakan. */
const SKIP_UPDATE = new Set(["id", "rev", "user_id", "created_at", "uploaded_at"]);
const CHUNK = 400;

async function select(db, sql, args = []) {
  const res = await db.execute({ sql, args });
  return res.rows.map((row) => Object.fromEntries(res.columns.map((c, i) => [c, row[i]])));
}

/** Baris tabel `table` dengan id tertentu, sebagai Map id → baris. */
async function byIds(db, table, ids) {
  const out = new Map();
  const list = [...new Set(ids)];
  for (let i = 0; i < list.length; i += CHUNK) {
    const part = list.slice(i, i + CHUNK);
    const rows = await select(db, `select * from ${q(table)} where id in (${part.map(() => "?").join(", ")})`, part);
    for (const r of rows) out.set(String(r.id), r);
  }
  return out;
}

async function userByEmail(db, email) {
  const rows = await select(db, "select id, name from users where lower(email) = lower(?)", [email]);
  return rows[0] ?? null;
}

/** "baru" | "perbarui" | "sama" | "vps-lebih-baru" | "lewati" (terhapus & belum pernah ada di VPS). */
function decide(src, dst) {
  if (!dst) return src.deleted_at === null ? "baru" : "lewati";
  if (String(src.updated_at) > String(dst.updated_at)) return "perbarui";
  return String(src.updated_at) === String(dst.updated_at) ? "sama" : "vps-lebih-baru";
}

function insertSql(table, row) {
  const cols = Object.keys(row).filter((c) => c !== "rev");
  return {
    sql: `insert into ${q(table)} (${cols.map(q).join(", ")}) values (${cols.map(() => "?").join(", ")})`,
    args: cols.map((c) => row[c]),
  };
}

function updateSql(table, id, row, skip = []) {
  const cols = Object.keys(row).filter((c) => !SKIP_UPDATE.has(c) && !skip.includes(c));
  return {
    sql: `update ${q(table)} set ${cols.map((c) => `${q(c)} = ?`).join(", ")} where id = ?`,
    args: [...cols.map((c) => row[c]), id],
  };
}

const tally = () => ({ baru: 0, perbarui: 0, sama: 0, "vps-lebih-baru": 0, lewati: 0 });

/** Gabungkan data akun `email` dari Vercel ke VPS. uji: hanya laporan. */
export async function salinAkun({ email, uji = false, log = console.log } = {}) {
  if (!email) throw new SalinError("--email wajib diisi.");
  const sides = endpoints();
  const [source, target] = [sides.salinan, sides.utama];
  const src = source.db();
  const dst = target.db();
  try {
    log(`→ akun ${email}: ${source.label} (Vercel) → ${target.label} (VPS)${uji ? " (uji, tanpa menulis)" : ""}`);

    const [a, b] = [await schemaSignature(src, TABLES), await schemaSignature(dst, TABLES)];
    const different = TABLES.filter((t) => a[t] !== b[t]);
    if (different.length > 0) {
      throw new SalinError(`Susunan tabel berbeda (${different.join(", ")}). Perbarui aplikasi di kedua sisi sampai versinya sama.`);
    }

    const from = await userByEmail(src, email);
    if (!from) throw new SalinError(`Email ${email} tidak terdaftar di Vercel.`);
    const to = await userByEmail(dst, email);
    if (!to) throw new SalinError(`Email ${email} belum terdaftar di VPS — daftarkan dulu akunnya di VPS.`);
    const S = String(from.id);
    const T = String(to.id);
    log(`  akun Vercel ${S} → akun VPS ${T}${S === T ? " (id sama)" : ""}`);

    // ---- Baca sumber.
    const sProjects = await select(src, "select * from projects where user_id = ?", [S]);
    const sCategories = await select(src, "select * from categories where user_id = ?", [S]);
    const sTransactions = await select(src, "select * from transactions where user_id = ?", [S]);
    const sReceipts = await select(
      src,
      "select r.* from receipts r join transactions t on t.id = r.transaction_id where t.user_id = ?",
      [S],
    );
    const sSettings = (await select(src, "select * from settings where user_id = ?", [S]))[0] ?? null;
    const sBuiltin = new Map((await select(src, "select * from categories where user_id is null")).map((c) => [String(c.id), c]));

    // Saat sungguhan, semua bacaan tujuan dan penulisan ada di dalam satu transaksi tulis.
    const tx = uji ? null : await dst.transaction("write");
    const db = tx ?? dst;
    try {
      const own = (row) => row.user_id === null || String(row.user_id) === T;
      const report = {};
      const writes = [];

      // ---- Kategori: id sama → yang lebih baru; nama+jenis sama milik akun VPS → dipakai bersama.
      const tCategories = await byIds(db, "categories", [...sCategories.map((c) => String(c.id)), ...sBuiltin.keys()]);
      const tOwnCats = await select(db, "select * from categories where (user_id = ? or user_id is null) and deleted_at is null", [T]);
      const catKey = (c) => `${c.user_id === null ? "" : "u"}|${c.type}|${String(c.name).toLowerCase()}`;
      const tCatByName = new Map(tOwnCats.map((c) => [catKey(c), String(c.id)]));
      const catMap = new Map(); // id kategori di Vercel → id di VPS
      const deferredCatDeletes = [];
      report.kategori = tally();
      for (const c of sCategories) {
        const id = String(c.id);
        const existing = tCategories.get(id);
        if (existing && !own(existing)) throw new SalinError(`Kategori ${id} di VPS milik akun lain — dibatalkan.`);
        if (!existing && c.deleted_at === null && tCatByName.has(catKey(c))) {
          catMap.set(id, tCatByName.get(catKey(c)));
          report.kategori.sama++;
          continue;
        }
        const d = decide(c, existing);
        report.kategori[d]++;
        if (d === "lewati") continue;
        catMap.set(id, id);
        if (d === "baru") writes.push(["kategori", insertSql("categories", { ...c, user_id: T })]);
        if (d === "perbarui") {
          if (c.deleted_at !== null && existing.deleted_at === null) {
            // Ditandai terhapus setelah transaksi digabung — trigger menolak bila masih dipakai.
            writes.push(["kategori", updateSql("categories", id, c, ["deleted_at", "updated_at"])]);
            deferredCatDeletes.push(c);
          } else {
            writes.push(["kategori", updateSql("categories", id, c)]);
          }
        }
      }
      for (const [id, c] of sBuiltin) {
        if (tCategories.has(id)) catMap.set(id, id);
        else if (tCatByName.has(catKey(c))) catMap.set(id, tCatByName.get(catKey(c)));
      }

      // ---- Proyek.
      const tProjects = await byIds(db, "projects", sProjects.map((p) => String(p.id)));
      const liveProjects = new Set(); // proyek yang akan ada di VPS setelah digabung
      for (const p of tProjects.values()) if (own(p)) liveProjects.add(String(p.id));
      report.proyek = tally();
      for (const p of sProjects) {
        const id = String(p.id);
        const existing = tProjects.get(id);
        if (existing && !own(existing)) throw new SalinError(`Proyek ${id} di VPS milik akun lain — dibatalkan.`);
        const d = decide(p, existing);
        report.proyek[d]++;
        if (d === "baru") {
          writes.push(["proyek", insertSql("projects", { ...p, user_id: T })]);
          liveProjects.add(id);
        }
        if (d === "perbarui") writes.push(["proyek", updateSql("projects", id, p)]);
      }

      // ---- Transaksi. has_receipt/no_receipt dirapikan setelah lampiran digabung.
      const tTransactions = await byIds(db, "transactions", sTransactions.map((t) => String(t.id)));
      const liveTransactions = new Set();
      for (const t of tTransactions.values()) if (own(t)) liveTransactions.add(String(t.id));
      const touchedTx = new Map(); // id → no_receipt dari Vercel (null: hanya lampirannya yang berubah)
      const txStamp = new Map(); // id → updated_at Vercel untuk transaksi yang ditulis
      const neededCats = new Set();
      report.transaksi = tally();
      for (const t of sTransactions) {
        const id = String(t.id);
        const existing = tTransactions.get(id);
        if (existing && !own(existing)) throw new SalinError(`Transaksi ${id} di VPS milik akun lain — dibatalkan.`);
        const d = decide(t, existing);
        if ((d === "baru" || d === "perbarui") && !liveProjects.has(String(t.project_id))) {
          // Proyeknya tidak ikut (terhapus di Vercel sebelum pernah ada di VPS).
          report.transaksi.lewati++;
          continue;
        }
        report.transaksi[d]++;
        if (d !== "baru" && d !== "perbarui") continue;
        const categoryId = catMap.get(String(t.category_id)) ?? null;
        if (!categoryId) throw new SalinError(`Kategori ${t.category_id} (transaksi ${id}) tidak ditemukan di VPS — dibatalkan.`);
        if (t.deleted_at === null) neededCats.add(categoryId);
        const row = { ...t, user_id: T, category_id: categoryId };
        if (d === "baru") {
          writes.push(["transaksi", insertSql("transactions", { ...row, has_receipt: 0 })]);
          liveTransactions.add(id);
        } else {
          writes.push(["transaksi", updateSql("transactions", id, row, ["has_receipt", "no_receipt"])]);
        }
        touchedTx.set(id, t.no_receipt);
        txStamp.set(id, t.updated_at);
      }
      // Kategori yang masih dipakai catatan dari Vercel tapi sudah terhapus di VPS dihidupkan lagi.
      const revive = [...(await byIds(db, "categories", [...neededCats])).values()].filter((c) => c.deleted_at !== null);
      for (const c of revive) {
        writes.unshift(["kategori", { sql: "update categories set deleted_at = null where id = ?", args: [c.id] }]);
      }
      if (revive.length) log(`  ! ${revive.length} kategori yang terhapus di VPS dihidupkan lagi karena dipakai catatan dari Vercel`);

      // ---- Lampiran.
      const tReceipts = await byIds(db, "receipts", sReceipts.map((r) => String(r.id)));
      const tReceiptOwners = await byIds(db, "transactions", [...tReceipts.values()].map((r) => String(r.transaction_id)));
      const keys = [];
      report.lampiran = tally();
      for (const r of sReceipts) {
        const id = String(r.id);
        const existing = tReceipts.get(id);
        if (existing && !own(tReceiptOwners.get(String(existing.transaction_id)) ?? { user_id: "?" })) {
          throw new SalinError(`Lampiran ${id} di VPS milik akun lain — dibatalkan.`);
        }
        const d = decide(r, existing);
        if ((d === "baru" || d === "perbarui") && !liveTransactions.has(String(r.transaction_id))) {
          report.lampiran.lewati++;
          continue;
        }
        report.lampiran[d]++;
        if (d !== "baru" && d !== "perbarui") continue;
        writes.push(["lampiran", d === "baru" ? insertSql("receipts", r) : updateSql("receipts", id, r, ["transaction_id"])]);
        const url = String(r.file_url);
        if (r.deleted_at === null && !url.startsWith("/") && !/^[a-z]+:/i.test(url)) keys.push(`receipts/${url}`);
        touchedTx.set(String(r.transaction_id), touchedTx.get(String(r.transaction_id)) ?? null);
      }

      // ---- Pengaturan (satu baris per akun).
      report.pengaturan = tally();
      const tSettings = (await select(db, "select * from settings where user_id = ?", [T]))[0] ?? null;
      if (sSettings) {
        const d = decide(sSettings, tSettings);
        report.pengaturan[d]++;
        const active = sSettings.active_project_id;
        const keepActive =
          active === null ||
          (liveProjects.has(String(active)) && sProjects.find((p) => String(p.id) === String(active))?.status !== "arsip");
        const row = { ...sSettings, user_id: T, active_project_id: keepActive ? active : (tSettings?.active_project_id ?? null) };
        if (d === "baru") {
          const taken = (await byIds(db, "settings", [String(sSettings.id)])).size > 0;
          writes.push(["pengaturan", insertSql("settings", { ...row, id: taken ? randomUUID() : sSettings.id })]);
        }
        if (d === "perbarui") writes.push(["pengaturan", updateSql("settings", String(tSettings.id), row)]);
      }

      log(
        `  ${Object.entries(report)
          .map(([t, r]) => `${t}: ${r.baru} baru, ${r.perbarui} diperbarui, ${r.sama} sama, ${r["vps-lebih-baru"]} VPS lebih baru, ${r.lewati} dilewati`)
          .join("\n  ")}`,
      );

      if (uji) {
        const files = await copyFiles(source, target, keys, true, log);
        log(`  berkas: ${files.diperiksa} diperiksa, ${files.disalin} perlu disalin, ${files.sudahAda} sudah ada`);
        log("✓ Uji selesai — tidak ada yang diubah.");
        return { uji: true, report, berkas: files };
      }

      // Berkas dulu: bila terputus di tengah, database belum menunjuk ke foto yang belum ada.
      const files = await copyFiles(source, target, keys, false, log);
      log(`  berkas: ${files.disalin} disalin, ${files.sudahAda} sudah ada${files.hilangDiSumber ? `, ${files.hilangDiSumber} tidak ditemukan` : ""}`);

      for (const [, stmt] of writes) await tx.execute(stmt);

      // Rapikan tanda struk transaksi yang tersentuh (trigger lampiran bisa mengubahnya).
      const live = "exists (select 1 from receipts where transaction_id = transactions.id and deleted_at is null)";
      for (const [id, noReceipt] of touchedTx) {
        const want = noReceipt === null ? "no_receipt" : "?";
        await tx.execute({
          sql: `update transactions set has_receipt = ${live}, no_receipt = case when ${live} then 0 else ${want} end
                where id = ? and (has_receipt is not ${live} or no_receipt is not case when ${live} then 0 else ${want} end)`,
          args: noReceipt === null ? [id] : [noReceipt, noReceipt, id],
        });
      }

      // Trigger lampiran ikut menaikkan updated_at; kembalikan ke versi Vercel agar penggabungan
      // berikutnya melihat baris ini "sama", bukan "VPS lebih baru".
      for (const [id, stamp] of txStamp) {
        await tx.execute({ sql: "update transactions set updated_at = ? where id = ? and updated_at is not ?", args: [stamp, id, stamp] });
      }

      // Kategori yang terhapus di Vercel — dilewati bila di VPS masih dipakai catatan.
      let keptCats = 0;
      for (const c of deferredCatDeletes) {
        const used = await tx.execute({
          sql: "select 1 from transactions where category_id = ? and deleted_at is null limit 1",
          args: [c.id],
        });
        if (used.rows.length > 0) {
          keptCats++;
          continue;
        }
        await tx.execute({ sql: "update categories set deleted_at = ?, updated_at = ? where id = ?", args: [c.deleted_at, c.updated_at, c.id] });
      }
      if (keptCats) log(`  ! ${keptCats} kategori tidak dihapus karena di VPS masih dipakai catatan`);

      const broken = await tx.execute("pragma foreign_key_check");
      if (broken.rows.length > 0) throw new SalinError(`Relasi data tidak utuh setelah digabung (${broken.rows.length} baris) — dibatalkan.`);
      await tx.commit();
      log(`✓ Selesai — ${writes.length} baris ditulis ke VPS.`);
      return { uji: false, report, berkas: files };
    } catch (error) {
      if (tx) await tx.rollback().catch(() => {});
      throw error;
    } finally {
      tx?.close();
    }
  } finally {
    src.close();
    dst.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");
  try {
    await salinAkun({ email: emailIndex >= 0 ? args[emailIndex + 1] : undefined, uji: args.includes("--uji") });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}${cause}`);
    process.exit(1);
  }
}
