// DB lokal di aplikasi Android: SQLite native (plugin @capacitor-community/sqlite) — file
// SQLite sungguhan di penyimpanan aplikasi, tidak ikut terhapus saat WebView membersihkan data
// situs. Antarmukanya sama dengan DB lokal browser (LocalDb), memakai skema & migrasi yang sama
// (local-schema.ts), jadi replica, CRUD lokal, dan sinkron tidak perlu tahu bedanya.
import { LOCAL_MIGRATIONS, LOCAL_SCHEMA_VERSION } from "./local-schema";
import type { LocalDb } from "./client";
import type { Row, SqlValue, Statement } from "./protocol";

/** Bagian koneksi plugin yang dipakai (memudahkan pengujian dengan SQLite lain). */
export type NativeConnection = {
  query(statement: string, values?: SqlValue[]): Promise<{ values?: Row[] }>;
  executeSet(set: { statement: string; values: SqlValue[] }[], transaction?: boolean): Promise<unknown>;
};

export const NATIVE_DB_NAME = "uanglapangan";

/** DB perangkat dibuat versi aplikasi yang lebih baru — jangan disentuh. */
export class NewerLocalSchemaError extends Error {}

async function schemaVersion(conn: NativeConnection): Promise<number> {
  const { values } = await conn.query("PRAGMA user_version");
  return Number(values?.[0]?.user_version ?? 0);
}

/**
 * Jalankan langkah migrasi yang belum diterapkan, satu transaksi per versi (versi ikut
 * tersimpan di transaksi yang sama). Melempar NewerLocalSchemaError bila DB lebih baru.
 */
export async function migrateNative(conn: NativeConnection): Promise<{ previousVersion: number }> {
  const previousVersion = await schemaVersion(conn);
  if (previousVersion > LOCAL_SCHEMA_VERSION) {
    throw new NewerLocalSchemaError(
      `DB perangkat memakai skema v${previousVersion}, lebih baru dari aplikasi ini (v${LOCAL_SCHEMA_VERSION}). Perbarui aplikasi.`,
    );
  }
  for (let v = previousVersion; v < LOCAL_SCHEMA_VERSION; v++) {
    try {
      await conn.executeSet(
        [
          ...LOCAL_MIGRATIONS[v].map((statement) => ({ statement, values: [] })),
          { statement: `PRAGMA user_version = ${v + 1}`, values: [] },
        ],
        true,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`migrasi skema v${v + 1} gagal: ${reason}`);
    }
  }
  return { previousVersion };
}

/** Bungkus koneksi native menjadi LocalDb. */
export function createNativeLocalDb(
  conn: NativeConnection,
  info: { previousVersion: number; rebuilt?: string },
): LocalDb {
  return {
    file: `SQLite native (${NATIVE_DB_NAME}.db)`,
    schemaVersion: LOCAL_SCHEMA_VERSION,
    previousVersion: info.previousVersion,
    rebuilt: info.rebuilt,
    query: async (sql, bind) => (await conn.query(sql, bind ?? [])).values ?? [],
    batch: async (statements: Statement[]) => {
      await conn.executeSet(
        statements.map((s) => ({ statement: s.sql, values: s.bind ?? [] })),
        true, // semua tersimpan atau tidak sama sekali
      );
    },
  };
}

/**
 * Buka DB native bila berjalan di aplikasi Android dan plugin tersedia; null di browser.
 * Migrasi gagal → DB dihapus & dibuat ulang (isinya hanya salinan data server; antrean offline
 * disimpan terpisah). DB lebih baru dari aplikasi → melempar (pemanggil memakai cadangan).
 */
export async function openNativeDb(): Promise<LocalDb | null> {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("CapacitorSQLite")) return null;

  const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency().catch(() => {});
  const connect = async () => {
    const exists = (await sqlite.isConnection(NATIVE_DB_NAME, false)).result;
    const conn = exists
      ? await sqlite.retrieveConnection(NATIVE_DB_NAME, false)
      : await sqlite.createConnection(NATIVE_DB_NAME, false, "no-encryption", 1, false);
    await conn.open();
    return conn;
  };

  let conn = await connect();
  try {
    const { previousVersion } = await migrateNative(conn);
    return createNativeLocalDb(conn, { previousVersion });
  } catch (error) {
    if (error instanceof NewerLocalSchemaError) throw error;
    const rebuilt = error instanceof Error ? error.message : String(error);
    console.warn(`DB perangkat dibangun ulang (${rebuilt}).`);
    await conn.close().catch(() => {});
    await sqlite.closeConnection(NATIVE_DB_NAME, false).catch(() => {});
    await CapacitorSQLite.deleteDatabase({ database: NATIVE_DB_NAME }).catch(() => {});
    conn = await connect();
    await migrateNative(conn);
    return createNativeLocalDb(conn, { previousVersion: 0, rebuilt });
  }
}
