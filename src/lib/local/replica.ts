// Salinan data proyek aktif yang disimpan di perangkat ("replica" lokal — PRD Fase 6).
// Halaman membaca data dari sini, dan saldo dihitung di perangkat.
// Disimpan di DB SQLite perangkat (src/lib/local/replica-storage.ts), dengan localStorage
// sebagai cadangan, dan ditarik dari server saat halaman dibuka / berkala.
import type { Category, DashboardSummary, Project, Transaction } from "@/lib/types";

// 2: tanda "tanpa struk" pindah ke Transaction.noReceipt (dulu daftar noReceiptIds).
export const REPLICA_SCHEMA = 2;
const STORAGE_KEY = "uanglapangan:replica:v1";

export type Replica = {
  schema: typeof REPLICA_SCHEMA;
  /** Waktu terakhir data ditarik dari server (ISO). */
  syncedAt: string;
  project: Project;
  lowBalanceThreshold: number;
  categories: Category[];
  /** Semua transaksi proyek aktif, terbaru dulu. */
  transactions: Transaction[];
  /**
   * Kursor sinkron: rev hub tertinggi yang sudah tercakup replica ini. Tarikan berikutnya cukup
   * meminta perubahan dengan rev > kursor. Kosong = belum pernah (tarik penuh).
   */
  cursor?: number;
};

/** Baca replica dari perangkat; null bila belum ada / rusak / penyimpanan tidak tersedia. */
export function readReplica(): Replica | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Replica>;
    return data.schema === REPLICA_SCHEMA && data.project && Array.isArray(data.transactions)
      ? (data as Replica)
      : null;
  } catch {
    return null;
  }
}

/** Hapus replica dari localStorage (dipakai setelah dipindah ke DB lokal / reset). */
export function removeStoredReplica(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // diabaikan
  }
}

/** Simpan replica ke perangkat. Mengembalikan false bila penyimpanan penuh/diblokir. */
export function writeReplica(replica: Replica): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(replica));
    return true;
  } catch {
    return false;
  }
}

/** Saldo & ringkasan dihitung di perangkat: dana awal + pemasukan − pengeluaran. */
export function summarizeReplica(r: Replica): DashboardSummary {
  let totalIncome = 0;
  let totalExpense = 0;
  for (const t of r.transactions) {
    if (t.type === "income") totalIncome += t.amount;
    else totalExpense += t.amount;
  }
  return {
    project: r.project,
    totalIncome,
    totalExpense,
    balance: r.project.budget + totalIncome - totalExpense,
    lowBalanceThreshold: r.lowBalanceThreshold,
  };
}
