"use client";

import { useSyncExternalStore } from "react";

import {
  buildReplica,
  concatChanges,
  countChanges,
  EMPTY_CHANGES,
  mergeChanges,
} from "@/lib/local/apply-changes";
import { pullPage, pushOps, type PushOp, type PushResult, type SyncChanges } from "@/lib/local/hub-client";
import {
  applyOutbox,
  readFailed,
  readOutbox,
  writeFailed,
  writeOutbox,
  type FailedOp,
  type OutboxOp,
} from "@/lib/local/outbox";
import { readReplica, removeStoredReplica, type Replica } from "@/lib/local/replica";
import type { TransactionRowChanges } from "@/lib/local/db/replica-repo";
import { getReplicaBackend, type ReplicaStorageKind } from "@/lib/local/replica-storage";
import type { TransactionInput } from "@/lib/transaction-rules";
import type { Transaction } from "@/lib/types";

// Store perangkat: replica + antrean perubahan offline, dibaca lewat useSyncExternalStore.
// Replica dibaca dari cache memori (sinkron, untuk tampilan) dan disimpan ke DB lokal di latar
// belakang (replica-storage.ts). Antrean offline tetap di localStorage: penulisannya sinkron,
// jadi catatan yang baru dibuat tidak hilang walau aplikasi langsung ditutup.
let replicaCache: Replica | null | undefined;
let outboxCache: OutboxOp[] | undefined;
let failedCache: FailedOp[] | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getReplica(): Replica | null {
  if (replicaCache === undefined) {
    // Sementara DB lokal dibuka: pakai salinan localStorage (bila masih ada) agar tampil instan.
    replicaCache = readReplica();
    void loadFromBackend();
  }
  return replicaCache;
}

export type ReplicaStorageInfo = {
  kind: ReplicaStorageKind;
  location: string;
  notice?: string;
  error?: string;
  /** Penanda waktu sinkron yang tersimpan di perangkat. */
  lastPulledAt?: string | null;
  lastPushedAt?: string | null;
};
let storageInfo: ReplicaStorageInfo | null = null;

let loading: Promise<void> | null = null;
function loadFromBackend(): Promise<void> {
  loading ??= (async () => {
    try {
      const backend = await getReplicaBackend();
      const marks = await backend.syncMarks().catch(() => null);
      storageInfo = {
        kind: backend.kind,
        location: backend.location,
        notice: backend.notice,
        lastPulledAt: marks?.lastPulledAt,
        lastPushedAt: marks?.lastPushedAt,
      };
      const stored = await backend.load();
      // Selama DB dibuka, data server bisa sudah masuk ke memori. Pakai yang lebih baru; bila
      // itu data perangkat, antrean diterapkan ulang (aman diulang) agar catatan yang dibuat
      // selama DB dibuka tidak hilang. Versi memori yang lebih baru ditulis oleh persist().
      if (stored && (!replicaCache || stored.syncedAt > replicaCache.syncedAt)) {
        replicaCache = applyOutbox(stored, getOutbox());
      }
    } catch (error) {
      console.warn("Gagal memuat data perangkat:", error);
    }
    emit();
  })();
  return loading;
}

// Penulisan ke DB perangkat, berurutan dan baru setelah data perangkat selesai dimuat &
// dibandingkan (supaya tidak menimpa data perangkat yang lebih baru):
// - "full": tulis ulang seluruh replica (setelah menarik data server);
// - "rows": CRUD per baris untuk perubahan di perangkat (catat/ubah/hapus satu transaksi).
type WriteTask = { kind: "full" } | ({ kind: "rows" } & TransactionRowChanges);
let writeQueue: WriteTask[] = [];
let saving: Promise<void> | null = null;

function persist(task: WriteTask = { kind: "full" }) {
  // Tulis ulang penuh sudah mencakup semua perubahan baris sebelumnya.
  if (task.kind === "full") writeQueue = [task];
  else writeQueue.push(task);
  saving ??= (async () => {
    await loadFromBackend();
    const backend = await getReplicaBackend();
    while (writeQueue.length > 0) {
      const next = writeQueue.shift()!;
      const current = replicaCache;
      if (!current) continue;
      try {
        if (next.kind === "full") {
          await backend.save(current);
          if (storageInfo) storageInfo = { ...storageInfo, lastPulledAt: current.syncedAt };
        } else {
          await backend.writeRows(next, current);
        }
        if (storageInfo?.error) storageInfo = { ...storageInfo, error: undefined };
      } catch (error) {
        storageInfo = {
          ...storageInfo,
          kind: backend.kind,
          location: backend.location,
          notice: backend.notice,
          error: error instanceof Error ? error.message : String(error),
        };
        emit();
      }
    }
    saving = null;
  })();
}

const EMPTY_OPS: OutboxOp[] = [];
const EMPTY_FAILED: FailedOp[] = [];

function getOutbox(): OutboxOp[] {
  if (outboxCache === undefined) outboxCache = readOutbox();
  return outboxCache;
}

function getFailed(): FailedOp[] {
  if (failedCache === undefined) failedCache = readFailed();
  return failedCache;
}

function setReplica(replica: Replica, task?: WriteTask) {
  replicaCache = replica;
  persist(task);
}

function setOutbox(ops: OutboxOp[]) {
  outboxCache = ops;
  writeOutbox(ops);
}

/**
 * Tarik data dari server ke replica perangkat. Perubahan yang masih di antrean diterapkan
 * ulang di atasnya supaya tidak hilang. Snapshot yang sama atau lebih tua dari replica yang
 * sudah ada diabaikan — mis. halaman lama yang dipulihkan dari cache saat menekan "kembali";
 * menerapkannya lagi akan menimpa catatan yang sudah terkirim dari antrean.
 * Selama DB perangkat masih dibuka, snapshot langsung dipakai di memori (pencatatan tidak
 * menunggu); penulisan ke DB menunggu sampai data perangkat dibandingkan (lihat persist).
 * False bila snapshot diabaikan.
 */
export function pullIntoReplica(snapshot: Replica): boolean {
  const current = getReplica();
  if (current && current.syncedAt >= snapshot.syncedAt) return false;
  setReplica(applyOutbox(snapshot, getOutbox()));
  emit();
  return true;
}

// ---- Perubahan saat offline -------------------------------------------------------------

/** Perubahan yang sedang dikirim ke server — tidak boleh digabung / dibuang dari antrean. */
const inFlightOpIds = new Set<string>();

/**
 * Gabungkan perubahan baru dengan antrean yang belum terkirim, supaya server hanya menerima
 * hasil akhirnya:
 * - ubah catatan yang dibuat offline → isi catatan baru itu diperbarui;
 * - ubah lagi catatan yang sudah antre diubah → digabung (base tetap versi server semula);
 * - hapus catatan yang dibuat offline → catatan & perubahannya dibuang (server tak pernah tahu);
 * - hapus catatan yang antre diubah → perubahannya dibuang, cukup kirim hapus.
 */
function mergeIntoOutbox(ops: OutboxOp[], op: OutboxOp): OutboxOp[] {
  const waiting = (o: OutboxOp) => !inFlightOpIds.has(o.opId);
  const targets = (o: OutboxOp, id: string) => (o.kind === "create" ? o.tx.id : o.txId) === id;

  if (op.kind === "update") {
    const i = ops.findIndex((o) => waiting(o) && targets(o, op.txId) && o.kind !== "delete");
    if (i >= 0 && ops.slice(i + 1).every((o) => !targets(o, op.txId))) {
      const prev = ops[i];
      const merged: OutboxOp =
        prev.kind === "create"
          ? { ...prev, tx: { ...prev.tx, ...op.changes } }
          : prev.kind === "update"
            ? {
                ...prev,
                changes: { ...prev.changes, ...op.changes },
                base: op.base ? prev.base : undefined,
                queuedAt: op.queuedAt, // waktu ubah terakhir — dipakai last-write-wins
              }
            : prev;
      return ops.map((o, j) => (j === i ? merged : o));
    }
  } else if (op.kind === "delete") {
    const created = ops.some((o) => o.kind === "create" && o.tx.id === op.txId && waiting(o));
    const rest = ops.filter((o) => !(targets(o, op.txId) && waiting(o)));
    // Dibuat offline & belum terkirim → cukup dibuang dari antrean, tanpa kirim hapus.
    return created ? rest : [...rest, op];
  }
  return [...ops, op];
}

function enqueue(op: OutboxOp) {
  setOutbox(mergeIntoOutbox(getOutbox(), op));
  const replica = getReplica();
  if (replica) {
    const next = applyOutbox(replica, [op]);
    const id = op.kind === "create" ? op.tx.id : op.txId;
    const row = next.transactions.find((t) => t.id === id);
    setReplica(next, { kind: "rows", upsert: row ? [row] : [], remove: row ? [] : [id] });
  }
  emit();
}

const now = () => new Date().toISOString();

/** Catat transaksi baru di perangkat. Mengembalikan null bila belum ada replica proyek aktif. */
export function queueCreate(
  type: Transaction["type"],
  input: TransactionInput,
  { noReceipt = false }: { noReceipt?: boolean } = {},
): Transaction | null {
  const replica = getReplica();
  if (!replica) return null;
  const tx: Transaction = {
    ...input,
    id: crypto.randomUUID(),
    projectId: replica.project.id,
    type,
    hasReceipt: false,
    noReceipt,
  };
  enqueue({ opId: crypto.randomUUID(), kind: "create", tx, queuedAt: now() });
  return tx;
}

/**
 * Ubah catatan di perangkat. Isi catatan sebelum diubah (versi di replica, termasuk perubahan
 * offline sebelumnya) ikut dikirim sebagai `base` agar server bisa mendeteksi bila catatan
 * yang sama sudah diubah di perangkat lain (bentrok). `force` = sengaja menimpa versi server.
 */
export function queueUpdate(
  txId: string,
  txType: Transaction["type"],
  changes: TransactionInput,
  { force = false }: { force?: boolean } = {},
) {
  const current = getReplica()?.transactions.find((t) => t.id === txId);
  const base: TransactionInput | undefined =
    current && !force
      ? {
          amount: current.amount,
          categoryId: current.categoryId,
          transactionDate: current.transactionDate,
          description: current.description,
        }
      : undefined;
  enqueue({ opId: crypto.randomUUID(), kind: "update", txId, txType, changes, base, queuedAt: now() });
}

export function queueDelete(txId: string) {
  enqueue({ opId: crypto.randomUUID(), kind: "delete", txId, queuedAt: now() });
}

// ---- Kirim antrean ke server ------------------------------------------------------------

export type FlushResult = { sent: number; rejected: number; remaining: number };
let flushing: Promise<FlushResult> | null = null;

/**
 * Jalankan `task` paling banyak satu pada satu waktu; pemanggil berikutnya menunggu hasil yang
 * sama. Penanda dilepas SETELAH tugas selesai — termasuk bila tugas selesai tanpa menunggu apa
 * pun (mis. antrean kosong); pola `x ??= (async () => { … finally { x = null } })()` gagal
 * di kasus itu karena finally berjalan sebelum x sempat diisi, sehingga x tertinggal selamanya.
 */
function singleFlight<T>(
  get: () => Promise<T> | null,
  set: (p: Promise<T> | null) => void,
  task: () => Promise<T>,
): Promise<T> {
  const running = get();
  if (running) return running;
  const promise = task();
  set(promise);
  void promise.finally(() => {
    if (get() === promise) set(null);
  });
  return promise;
}

/** Batas perubahan per kiriman (sama dengan MAX_PUSH_OPS di server). */
const PUSH_BATCH = 200;

/** OutboxOp → bentuk perubahan untuk POST /api/sync/push. */
function toPushOp(op: OutboxOp): PushOp {
  if (op.kind === "create") {
    const { id, projectId, type, amount, categoryId, transactionDate, description, noReceipt } = op.tx;
    return {
      opId: op.opId,
      kind: "create",
      // projectId = proyek saat dicatat — bukan proyek aktif saat antrean terkirim
      tx: { id, projectId, type, amount, categoryId, transactionDate, description, noReceipt: noReceipt === true },
    };
  }
  if (op.kind === "update") {
    // editedAt = waktu diubah di perangkat → resolusi last-write-wins di hub
    return { opId: op.opId, kind: "update", txId: op.txId, changes: op.changes, base: op.base, editedAt: op.queuedAt };
  }
  return { opId: op.opId, kind: "delete", txId: op.txId };
}

/**
 * Kirim antrean ke hub sekaligus (per 200 perubahan, berurutan). Hasil per perubahan:
 * diterapkan → keluar antrean; bentrok / ditolak / sudah dihapus → pindah ke "Perlu tindakan";
 * "belum bisa" (mis. belum ada proyek aktif) atau jaringan putus → sisanya tetap antre.
 */
export function flushOutbox(): Promise<FlushResult> {
  return singleFlight(() => flushing, (p) => (flushing = p), async () => {
    let sent = 0;
    let rejected = 0;
    try {
      while (getOutbox().length > 0) {
        const batch = getOutbox().slice(0, PUSH_BATCH);
        batch.forEach((op) => inFlightOpIds.add(op.opId));
        const results = await pushOps(batch.map(toPushOp));
        batch.forEach((op) => inFlightOpIds.delete(op.opId));
        if (results === "retry") break;

        const done = new Set<string>();
        let stalled = false;
        for (const [i, result] of results.entries()) {
          const op = batch[i];
          if (!op || result.opId !== op.opId) break;
          if (result.status === "unavailable") {
            stalled = true; // perubahan ini & sesudahnya dicoba lagi nanti
            break;
          }
          done.add(op.opId);
          if (result.status === "applied" || (result.status === "not_found" && op.kind !== "update")) {
            sent++;
          } else {
            failedCache = [...getFailed(), toFailed(op, result)];
            writeFailed(failedCache);
            rejected++;
          }
        }
        // Hapus hanya yang barusan diproses — perubahan baru bisa masuk antrean selama dikirim.
        setOutbox(getOutbox().filter((o) => !done.has(o.opId)));
        emit();
        if (stalled || done.size === 0) break;
      }
    } finally {
      inFlightOpIds.clear();
    }
    if (sent > 0) void recordPushed();
    return { sent, rejected, remaining: getOutbox().length };
  });
}

/** Penanda waktu: perubahan perangkat terakhir berhasil terkirim. */
async function recordPushed() {
  const at = new Date().toISOString();
  if (storageInfo) storageInfo = { ...storageInfo, lastPushedAt: at };
  emit();
  try {
    await (await getReplicaBackend()).markPushed(at);
  } catch (error) {
    console.warn("Gagal mencatat waktu kirim:", error);
  }
}

function toFailed(op: OutboxOp, result: Exclude<PushResult, { status: "applied" | "unavailable" }>): FailedOp {
  if (result.status === "conflict") {
    return {
      op,
      kind: "conflict",
      server: result.data,
      reason:
        "Catatan ini diubah di perangkat lain setelah Anda mengubahnya, jadi versi itu yang dipakai (yang terbaru menang). Pilih “Pakai versi saya” bila perubahan Anda yang benar.",
    };
  }
  if (result.status === "not_found") {
    return { op, kind: "deleted", reason: "Catatan ini sudah dihapus di perangkat lain." };
  }
  const detail = result.fieldErrors ? Object.values(result.fieldErrors).join(" ") : "";
  return { op, kind: "rejected", reason: [result.error, detail].filter(Boolean).join(" — ") };
}

// ---- Tarik perubahan dari hub -----------------------------------------------------------

export type PullReport = {
  /** Jumlah baris berubah yang diterima. */
  received: number;
  /** Replica dibangun ulang (tarikan penuh, mis. proyek aktif berganti). */
  rebuilt: boolean;
  /** false = jaringan / server bermasalah, dicoba lagi nanti. */
  ok: boolean;
};

/** Semua halaman perubahan sejak `since`. "retry" bila salah satu halaman gagal. */
async function pullAll(since: number): Promise<{ cursor: number; changes: SyncChanges } | "retry"> {
  let cursor = since;
  let changes = EMPTY_CHANGES;
  for (;;) {
    const page = await pullPage(cursor);
    if (page === "retry") return "retry";
    changes = concatChanges(changes, page.changes);
    cursor = page.cursor;
    if (!page.hasMore) return { cursor, changes };
  }
}

/**
 * Tarik perubahan sejak kursor replica dan terapkan ke replica perangkat. Tanpa kursor
 * (atau proyek aktif berganti) → tarik penuh lalu bangun ulang. Antrean diterapkan lagi di
 * atasnya supaya perubahan yang belum terkirim tidak hilang dari tampilan.
 */
export async function pullFromHub(): Promise<PullReport> {
  await loadFromBackend();
  const start = getReplica();
  let result = await pullAll(start?.cursor ?? 0);
  if (result === "retry") return { received: 0, rebuilt: false, ok: false };

  const syncedAt = new Date().toISOString();
  // Replica bisa berubah selama menarik (catatan baru) — gabungkan ke versi terkini.
  const current = getReplica();
  let next: Replica | null | "rebuild" =
    current && current.cursor !== undefined && start?.cursor !== undefined
      ? mergeChanges(current, result.changes, result.cursor, syncedAt)
      : "rebuild";
  let rebuilt = false;
  if (next === "rebuild") {
    rebuilt = true;
    if (start?.cursor !== undefined && start.cursor > 0) {
      const full = await pullAll(0);
      if (full === "retry") return { received: countChanges(result.changes), rebuilt: false, ok: false };
      result = full;
    }
    next = buildReplica(result.changes, result.cursor, syncedAt);
  }

  if (next) {
    setReplica(applyOutbox(next, getOutbox()));
  } else if (getOutbox().length === 0) {
    // Tidak ada proyek aktif lagi (diarsipkan / dilepas di perangkat lain).
    replicaCache = null;
    void getReplicaBackend().then((backend) => backend.clear());
  }
  emit();
  return { received: countChanges(result.changes), rebuilt, ok: true };
}

export type SyncReport = FlushResult & PullReport;
let syncing: Promise<SyncReport> | null = null;
/** Diminta sinkron lagi selagi satu putaran berjalan (mis. perubahan baru masuk antrean). */
let syncAgain = false;
/** Batas putaran beruntun dalam satu panggilan (cegah putaran tanpa henti). */
const MAX_SYNC_ROUNDS = 3;

/**
 * Satu putaran sinkron dengan hub: kirim antrean, lalu tarik perubahan perangkat lain.
 * Hanya satu putaran berjalan pada satu waktu.
 */
export function syncNow(): Promise<SyncReport> {
  // Putaran yang sedang berjalan mungkin sudah lewat tahap kirim — minta satu putaran lagi
  // supaya perubahan yang baru masuk antrean tidak menunggu sampai jadwal berikutnya.
  if (syncing) syncAgain = true;
  return singleFlight(() => syncing, (p) => (syncing = p), async () => {
    setSyncState({ syncing: true });
    try {
      let report: SyncReport;
      let rounds = 0;
      do {
        syncAgain = false;
        const pushed = await flushOutbox();
        const pulled = await pullFromHub();
        report = { ...pushed, ...pulled };
      } while (syncAgain && ++rounds < MAX_SYNC_ROUNDS && report.ok);
      return report;
    } finally {
      syncAgain = false;
      setSyncState({ syncing: false });
    }
  });
}

export function dismissFailed() {
  failedCache = [];
  writeFailed([]);
  emit();
}

/**
 * Keputusan pengguna atas perubahan yang tidak bisa diterapkan:
 * - discard: buang perubahan perangkat (pakai versi server);
 * - keep-mine: kirim ulang perubahan perangkat dan timpa versi server (bentrok);
 * - restore: catatan sudah dihapus di perangkat lain → buat ulang sebagai catatan baru.
 */
export function resolveFailed(opId: string, action: "discard" | "keep-mine" | "restore") {
  const item = getFailed().find((f) => f.op.opId === opId);
  if (!item) return;
  failedCache = getFailed().filter((f) => f.op.opId !== opId);
  writeFailed(failedCache);
  const op = item.op;
  if (action === "keep-mine" && op.kind === "update") {
    queueUpdate(op.txId, op.txType, op.changes, { force: true });
  } else if (action === "restore" && op.kind === "update") {
    queueCreate(op.txType, op.changes);
  } else {
    emit();
  }
}

/**
 * Pemulihan: buang salinan data di perangkat lalu ambil ulang dari server.
 * Hanya bila tidak ada perubahan yang belum terkirim (agar tidak ada yang hilang).
 */
export function resetDeviceData(): boolean {
  if (getOutbox().length > 0) return false;
  replicaCache = null;
  writeQueue = [];
  removeStoredReplica();
  void getReplicaBackend().then((backend) => backend.clear());
  emit();
  return true;
}

/**
 * Hapus SEMUA data akun di perangkat, termasuk antrean yang belum terkirim (keluar akun /
 * akun lain masuk). Menunggu sampai penyimpanan perangkat benar-benar kosong.
 */
export async function wipeDeviceData(): Promise<void> {
  // Tunggu penulisan yang sedang berjalan agar tidak menulis ulang data lama setelah dihapus.
  await saving?.catch(() => {});
  writeQueue = [];
  replicaCache = null;
  setOutbox([]);
  failedCache = [];
  writeFailed([]);
  removeStoredReplica();
  const backend = await getReplicaBackend().catch(() => null);
  await backend?.clear().catch(() => {});
  emit();
}

// ---- Status sinkron berkala -------------------------------------------------------------

/** Selang tarik data otomatis (hemat kuota — bukan realtime). */
export const PULL_INTERVAL_MS = 5 * 60_000;

export type SyncState = {
  /** Sedang mengirim antrean / menarik data terbaru. */
  syncing: boolean;
  /** Perkiraan waktu tarik otomatis berikutnya (epoch ms), null bila tidak dijadwalkan. */
  nextPullAt: number | null;
};

const IDLE_SYNC: SyncState = { syncing: false, nextPullAt: null };
let syncState: SyncState = IDLE_SYNC;

/** Diperbarui oleh SyncManager. */
export function setSyncState(patch: Partial<SyncState>) {
  const next = { ...syncState, ...patch };
  if (next.syncing === syncState.syncing && next.nextPullAt === syncState.nextPullAt) return;
  syncState = next;
  emit();
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, () => syncState, () => IDLE_SYNC);
}

// ---- Hook untuk komponen ----------------------------------------------------------------

/**
 * Replica yang dipakai halaman: versi perangkat bila sama baru / lebih baru dari data server,
 * selain itu data server (yang segera ditarik ke perangkat).
 */
export function useLocalReplica(serverSnapshot: Replica | null): {
  replica: Replica | null;
  /** true bila data yang tampil sudah tersimpan di perangkat. */
  onDevice: boolean;
} {
  const local = useSyncExternalStore(subscribe, getReplica, () => null);
  if (local && (!serverSnapshot || local.syncedAt >= serverSnapshot.syncedAt)) {
    return { replica: local, onDevice: true };
  }
  return { replica: serverSnapshot, onDevice: false };
}

/** Jumlah perubahan yang belum terkirim (di luar React, mis. siklus hidup aplikasi). */
export function pendingCount(): number {
  return getOutbox().length;
}

/** Tempat data perangkat disimpan (null selama DB lokal dibuka). */
export function useReplicaStorage(): ReplicaStorageInfo | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      getReplica(); // memicu pembukaan DB lokal
      return storageInfo;
    },
    () => null,
  );
}

/** Perubahan yang belum terkirim ke server. */
export function useOutbox(): OutboxOp[] {
  return useSyncExternalStore(subscribe, getOutbox, () => EMPTY_OPS);
}

/** Perubahan yang ditolak server saat dikirim. */
export function useFailedOps(): FailedOp[] {
  return useSyncExternalStore(subscribe, getFailed, () => EMPTY_FAILED);
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Status koneksi perangkat (dianggap online saat dirender di server). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

// Mode dev: akses store dari DevTools / tes (mis. __uanglapanganStore.outbox()).
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __uanglapanganStore?: unknown }).__uanglapanganStore = {
    queueCreate,
    queueUpdate,
    queueDelete,
    outbox: getOutbox,
    replica: getReplica,
    syncNow,
  };
}
