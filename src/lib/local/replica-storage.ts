// Tempat replica disimpan di perangkat:
// - "sqlite": DB SQLite lokal (OPFS, lihat src/lib/local/db) — penyimpanan utama.
// - "localStorage": cadangan bila DB lokal tidak bisa dibuka (browser lama, tab lain sedang
//   memegang DB). Replica lama di localStorage dipindahkan ke SQLite sekali saat pertama dibuka.
import { localDbUnavailableReason, openLocalDb } from "@/lib/local/db/client";
import {
  clearReplica,
  loadReplica,
  markPushed,
  readSyncMarks,
  saveReplica,
  type SyncMarks,
  writeTransactionRows,
  type TransactionRowChanges,
} from "@/lib/local/db/replica-repo";
import { readReplica, removeStoredReplica, writeReplica, type Replica } from "@/lib/local/replica";

export type ReplicaStorageKind = "sqlite" | "localStorage";

export type ReplicaBackend = {
  kind: ReplicaStorageKind;
  /** Lokasi data untuk ditampilkan di halaman Sinkronisasi. */
  location: string;
  /** Keterangan tambahan: alasan memakai cadangan, atau skema yang baru dimigrasi/dibangun ulang. */
  notice?: string;
  load(): Promise<Replica | null>;
  save(replica: Replica): Promise<void>;
  /** Tulis perubahan per baris; `replica` = isi lengkap terbaru (untuk penyimpanan tanpa tabel). */
  writeRows(changes: TransactionRowChanges, replica: Replica): Promise<void>;
  clear(): Promise<void>;
  /** Penanda waktu sinkron (terakhir tarik / kirim). */
  syncMarks(): Promise<SyncMarks>;
  markPushed(at: string): Promise<void>;
};

const PUSHED_KEY = "uanglapangan:last-pushed-at";

const localStorageBackend: ReplicaBackend = {
  kind: "localStorage",
  location: "penyimpanan browser (cadangan)",
  load: async () => readReplica(),
  save: async (replica) => {
    if (!writeReplica(replica)) throw new Error("Penyimpanan browser penuh atau diblokir.");
  },
  writeRows: async (_changes, replica) => {
    if (!writeReplica(replica)) throw new Error("Penyimpanan browser penuh atau diblokir.");
  },
  clear: async () => removeStoredReplica(),
  syncMarks: async () => {
    let lastPushedAt: string | null = null;
    try {
      lastPushedAt = window.localStorage.getItem(PUSHED_KEY);
    } catch {
      // diabaikan
    }
    return { lastPulledAt: readReplica()?.syncedAt ?? null, lastPushedAt };
  },
  markPushed: async (at) => {
    try {
      window.localStorage.setItem(PUSHED_KEY, at);
    } catch {
      // diabaikan
    }
  },
};

let backend: Promise<ReplicaBackend> | null = null;

export function getReplicaBackend(): Promise<ReplicaBackend> {
  backend ??= (async () => {
    const db = await openLocalDb();
    if (!db) return { ...localStorageBackend, notice: localDbUnavailableReason() ?? undefined };
    try {
      // Pindahkan replica lama (localStorage) ke SQLite bila lebih baru dari isi DB.
      const legacy = readReplica();
      if (legacy) {
        const stored = await loadReplica(db);
        if (!stored || stored.syncedAt < legacy.syncedAt) await saveReplica(db, legacy);
        removeStoredReplica();
      }
    } catch (error) {
      console.warn("Gagal memindahkan data perangkat ke DB lokal:", error);
      return localStorageBackend;
    }
    const notice = db.rebuilt
      ? `DB perangkat dibangun ulang dan diisi lagi dari server (${db.rebuilt}).`
      : db.previousVersion > 0 && db.previousVersion < db.schemaVersion
        ? `Skema diperbarui dari v${db.previousVersion} ke v${db.schemaVersion}.`
        : undefined;
    return {
      kind: "sqlite",
      location: `SQLite perangkat (${db.file}, skema v${db.schemaVersion})`,
      notice,
      load: () => loadReplica(db),
      save: (replica) => saveReplica(db, replica),
      writeRows: (changes) => writeTransactionRows(db, changes),
      clear: () => clearReplica(db),
      syncMarks: () => readSyncMarks(db),
      markPushed: (at) => markPushed(db, at),
    };
  })();
  return backend;
}
