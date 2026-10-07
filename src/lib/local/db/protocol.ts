// Pesan antara halaman dan worker SQLite perangkat (src/lib/local/db/sqlite.worker.ts).

export type SqlValue = string | number | null;
export type Statement = { sql: string; bind?: SqlValue[] };
export type Row = Record<string, SqlValue>;

export type RequestBody =
  | { op: "query"; statement: Statement }
  /** Beberapa perintah dalam satu transaksi: semua tersimpan, atau tidak sama sekali. */
  | { op: "batch"; statements: Statement[] };

export type WorkerRequest = RequestBody & { id: number };

export type WorkerReady = {
  type: "ready";
  ok: true;
  file: string;
  schemaVersion: number;
  /** Versi skema sebelum dibuka (0 = DB baru). */
  previousVersion: number;
  /** Alasan bila DB perangkat dibangun ulang karena migrasi gagal. */
  rebuilt?: string;
};
export type WorkerFailed = { type: "ready"; ok: false; error: string };

export type WorkerResponse =
  | WorkerReady
  | WorkerFailed
  | { type: "result"; id: number; ok: true; rows: Row[] }
  | { type: "result"; id: number; ok: false; error: string };
