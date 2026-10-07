// Antrean perubahan yang dibuat saat offline (outbox), disimpan di perangkat.
// Perubahan langsung diterapkan ke replica agar saldo ikut berubah, lalu dikirim ke server
// berurutan saat online. Fungsi di sini murni (tanpa React) agar mudah diuji.
import type { Replica } from "@/lib/local/replica";
import type { TransactionInput } from "@/lib/transaction-rules";
import type { Transaction } from "@/lib/types";

const OUTBOX_KEY = "uanglapangan:outbox:v1";
const FAILED_KEY = "uanglapangan:outbox-failed:v1";

export type OutboxOp =
  | { opId: string; kind: "create"; tx: Transaction; queuedAt: string }
  | {
      opId: string;
      kind: "update";
      txId: string;
      /** Jenis transaksi — dibutuhkan bila catatan harus dipulihkan sebagai catatan baru. */
      txType: Transaction["type"];
      changes: TransactionInput;
      /** Isi catatan saat mulai diubah di perangkat; server memakainya untuk mendeteksi bentrok. */
      base?: TransactionInput;
      queuedAt: string;
    }
  | { opId: string; kind: "delete"; txId: string; queuedAt: string };

/**
 * Perubahan yang tidak bisa diterapkan server dan menunggu keputusan pengguna:
 * - rejected: isian tidak valid lagi (mis. kategori sudah dihapus);
 * - deleted: catatan yang diubah ternyata sudah dihapus di perangkat lain;
 * - conflict: catatan sudah diubah di perangkat lain sejak mulai diubah di sini.
 */
export type FailedOp = {
  op: OutboxOp;
  reason: string;
  kind?: "rejected" | "deleted" | "conflict";
  /** Versi di server saat bentrok terdeteksi. */
  server?: Transaction;
};

function read<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Penyimpanan penuh/diblokir — antrean tetap ada di memori selama halaman terbuka.
  }
}

export const readOutbox = () => read<OutboxOp>(OUTBOX_KEY);
export const writeOutbox = (ops: OutboxOp[]) => write(OUTBOX_KEY, ops);
export const readFailed = () => read<FailedOp>(FAILED_KEY);
export const writeFailed = (items: FailedOp[]) => write(FAILED_KEY, items);

/** Sisipkan transaksi sambil menjaga urutan "terbaru dulu" (tanggal, lalu urutan catat). */
/** Sisipkan catatan pada tanggalnya (terbaru dulu; dalam tanggal yang sama paling atas). */
export function insertSorted(list: Transaction[], tx: Transaction): Transaction[] {
  const i = list.findIndex((t) => t.transactionDate <= tx.transactionDate);
  return i < 0 ? [...list, tx] : [...list.slice(0, i), tx, ...list.slice(i)];
}

/** Terapkan antrean ke replica (dipakai saat mencatat offline & setelah menarik data server). */
export function applyOutbox(replica: Replica, ops: OutboxOp[]): Replica {
  let list = replica.transactions;
  for (const op of ops) {
    if (op.kind === "create") {
      if (op.tx.projectId === replica.project.id && !list.some((t) => t.id === op.tx.id)) {
        list = insertSorted(list, op.tx);
      }
    } else if (op.kind === "update") {
      const current = list.find((t) => t.id === op.txId);
      if (current) {
        list = insertSorted(
          list.filter((t) => t.id !== op.txId),
          { ...current, ...op.changes },
        );
      }
    } else {
      list = list.filter((t) => t.id !== op.txId);
    }
  }
  return list === replica.transactions ? replica : { ...replica, transactions: list };
}

/** Id transaksi yang masih punya perubahan belum terkirim. */
export function pendingTransactionIds(ops: OutboxOp[]): Set<string> {
  return new Set(ops.map((op) => (op.kind === "create" ? op.tx.id : op.txId)));
}
