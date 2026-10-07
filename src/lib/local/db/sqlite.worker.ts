/// <reference lib="webworker" />
// Worker pemegang DB SQLite perangkat. SQLite (WASM) menyimpan file-nya di OPFS lewat VFS
// "opfs-sahpool" — tidak butuh header COOP/COEP dan didukung WebView Android. Berjalan di
// worker supaya akses disk tidak memblokir tampilan.
import type sqlite3InitModuleType from "@sqlite.org/sqlite-wasm";

import { LOCAL_MIGRATIONS, LOCAL_SCHEMA_VERSION } from "./local-schema";
import type { Row, Statement, WorkerRequest, WorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const DB_FILE = "/uanglapangan.sqlite3";
const post = (message: WorkerResponse) => self.postMessage(message);

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModuleType>>;
type Db = InstanceType<Awaited<ReturnType<Sqlite3["installOpfsSAHPoolVfs"]>>["OpfsSAHPoolDb"]>;

// SQLite WASM dimuat dari public/sqlite-wasm (disalin scripts/copy-sqlite-wasm.mjs), bukan
// dibundel: paket ini membuat Worker dari URL dinamis yang tidak bisa dibundel Turbopack.
const SQLITE_MODULE_URL = "/sqlite-wasm/index.mjs";

const schemaVersion = (db: Db) => Number(db.selectValue("PRAGMA user_version") ?? 0);

/** DB perangkat dibuat versi aplikasi yang lebih baru — jangan disentuh. */
class NewerSchemaError extends Error {}

/** Jalankan langkah migrasi yang belum diterapkan, satu transaksi per versi. */
function migrate(db: Db): void {
  const current = schemaVersion(db);
  if (current > LOCAL_SCHEMA_VERSION) {
    throw new NewerSchemaError(
      `DB perangkat memakai skema v${current}, lebih baru dari aplikasi ini (v${LOCAL_SCHEMA_VERSION}). Muat ulang aplikasi untuk memperbarui.`,
    );
  }
  for (let v = current; v < LOCAL_SCHEMA_VERSION; v++) {
    try {
      db.transaction(() => {
        for (const sql of LOCAL_MIGRATIONS[v]) db.exec(sql);
        db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`migrasi skema v${v + 1} gagal: ${reason}`);
    }
  }
}

function run(db: Db, { sql, bind }: Statement): Row[] {
  return db.exec({ sql, bind: bind ?? [], rowMode: "object", returnValue: "resultRows" }) as Row[];
}

async function open(): Promise<{ db: Db; previousVersion: number; rebuilt?: string }> {
  const { default: sqlite3InitModule } = (await import(
    /* turbopackIgnore: true */ /* webpackIgnore: true */ SQLITE_MODULE_URL
  )) as { default: typeof sqlite3InitModuleType };
  const sqlite3 = await sqlite3InitModule();
  // Satu pool per aplikasi. Hanya satu tab yang bisa memegangnya — tab lain memakai cadangan.
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "uanglapangan", initialCapacity: 6 });
  let db = new pool.OpfsSAHPoolDb(DB_FILE);
  const previousVersion = schemaVersion(db);
  try {
    migrate(db);
    return { db, previousVersion };
  } catch (error) {
    if (error instanceof NewerSchemaError) {
      db.close();
      throw error;
    }
    // DB perangkat hanya salinan data server → bangun ulang dari nol, lalu ditarik lagi.
    const rebuilt = error instanceof Error ? error.message : String(error);
    console.warn(`DB perangkat dibangun ulang (${rebuilt}).`);
    db.close();
    pool.unlink(DB_FILE);
    db = new pool.OpfsSAHPoolDb(DB_FILE);
    migrate(db);
    return { db, previousVersion, rebuilt };
  }
}

const ready = open().then(
  ({ db, previousVersion, rebuilt }) => {
    post({
      type: "ready",
      ok: true,
      file: DB_FILE,
      schemaVersion: schemaVersion(db),
      previousVersion,
      rebuilt,
    });
    return db;
  },
  (error: unknown) => {
    post({ type: "ready", ok: false, error: error instanceof Error ? error.message : String(error) });
    return null;
  },
);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  const db = await ready;
  if (!db) {
    post({ type: "result", id: req.id, ok: false, error: "DB lokal tidak tersedia." });
    return;
  }
  try {
    let rows: Row[] = [];
    if (req.op === "query") {
      rows = run(db, req.statement);
    } else {
      db.transaction(() => {
        for (const statement of req.statements) run(db, statement);
      });
    }
    post({ type: "result", id: req.id, ok: true, rows });
  } catch (error) {
    post({
      type: "result",
      id: req.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
