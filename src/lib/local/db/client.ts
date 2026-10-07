// Akses DB SQLite perangkat dari halaman. Semua query dijalankan worker (sqlite.worker.ts).
// openLocalDb() menghasilkan null bila DB lokal tidak bisa dipakai — browser tanpa OPFS,
// tab lain sedang memegang DB, atau gagal dimuat — dan pemanggil memakai penyimpanan cadangan.
import type { RequestBody, Row, SqlValue, Statement, WorkerRequest, WorkerResponse } from "./protocol";

export type { Row, SqlValue, Statement };

export type LocalDb = {
  file: string;
  schemaVersion: number;
  /** Versi skema sebelum dibuka (0 = DB baru); berbeda dari schemaVersion bila baru dimigrasi. */
  previousVersion: number;
  /** Alasan bila DB perangkat dibangun ulang karena migrasi gagal. */
  rebuilt?: string;
  query(sql: string, bind?: SqlValue[]): Promise<Row[]>;
  /** Jalankan beberapa perintah dalam satu transaksi. */
  batch(statements: Statement[]): Promise<void>;
};

const OPEN_TIMEOUT_MS = 10_000;
let opening: Promise<LocalDb | null> | null = null;
let unavailableReason: string | null = null;

/** Alasan DB lokal tidak dipakai (setelah openLocalDb menghasilkan null). */
export function localDbUnavailableReason(): string | null {
  return unavailableReason;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
  );
}

/**
 * DB lokal perangkat: SQLite native di aplikasi Android (native-sqlite.ts), selain itu SQLite
 * WASM di worker (OPFS). Null bila keduanya tidak bisa dipakai → penyimpanan cadangan.
 */
export function openLocalDb(): Promise<LocalDb | null> {
  opening ??= (async () => {
    try {
      const { openNativeDb } = await import("./native-sqlite");
      const native = await openNativeDb();
      if (native) return native;
    } catch (error) {
      // DB native lebih baru dari aplikasi / plugin gagal → cadangan, jangan paksa worker
      // (di aplikasi Android keduanya menyimpan data yang sama).
      unavailableReason = error instanceof Error ? error.message : String(error);
      console.warn(`DB lokal native tidak dipakai (${unavailableReason}).`);
      return null;
    }
    return openWorkerDb();
  })();
  return opening;
}

function openWorkerDb(): Promise<LocalDb | null> {
  if (!supported()) {
    unavailableReason = "browser ini belum mendukung penyimpanan OPFS";
    return Promise.resolve(null);
  }
  return new Promise<LocalDb | null>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./sqlite.worker.ts", import.meta.url), {
        type: "module",
        name: "uanglapangan-db",
      });
    } catch {
      resolve(null);
      return;
    }

    const pending = new Map<number, { resolve: (rows: Row[]) => void; reject: (e: Error) => void }>();
    let nextId = 1;
    const fail = (reason: string) => {
      unavailableReason = reason;
      console.warn(`DB lokal tidak dipakai (${reason}) — memakai penyimpanan cadangan.`);
      clearTimeout(timer);
      worker.terminate();
      pending.forEach((p) => p.reject(new Error(reason)));
      pending.clear();
      resolve(null);
    };
    const timer = setTimeout(() => fail("waktu habis saat membuka"), OPEN_TIMEOUT_MS);

    const send = (req: RequestBody) =>
      new Promise<Row[]>((res, rej) => {
        const id = nextId++;
        pending.set(id, { resolve: res, reject: rej });
        worker.postMessage({ ...req, id } as WorkerRequest);
      });

    worker.onerror = (event) => fail(event.message || "worker gagal dimuat");
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === "ready") {
        if (!msg.ok) return fail(msg.error);
        clearTimeout(timer);
        resolve({
          file: msg.file,
          schemaVersion: msg.schemaVersion,
          previousVersion: msg.previousVersion,
          rebuilt: msg.rebuilt,
          query: (sql, bind) => send({ op: "query", statement: { sql, bind } }),
          batch: async (statements) => {
            await send({ op: "batch", statements });
          },
        });
        return;
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.rows);
      else p.reject(new Error(msg.error));
    };
  });
}

// Mode dev: buka DB lokal dari DevTools / tes, mis.
//   (await __uanglapanganLocalDb()).query("SELECT count(*) AS n FROM transactions")
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __uanglapanganLocalDb?: typeof openLocalDb }).__uanglapanganLocalDb =
    openLocalDb;
}
