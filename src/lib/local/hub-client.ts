// Klien HTTP ke hub sinkron (/api/sync/*) untuk perangkat: token sinkron berumur pendek
// diambil & diperbarui otomatis, identitas perangkat ikut di setiap panggilan, dan galat
// jaringan / server dikembalikan sebagai "retry" (dicoba lagi nanti, data tidak hilang).
import { getDeviceInfo } from "@/lib/local/device";
import type { Category, Project, Receipt, Transaction } from "@/lib/types";

type SyncFields = { rev: number; updatedAt: string; deletedAt: string | null };
export type Synced<T> = T & SyncFields;
export type SyncChanges = {
  projects: Synced<Project>[];
  categories: Synced<Category>[];
  transactions: Synced<Transaction>[];
  receipts: Synced<Receipt>[];
  settings: Synced<{ activeProjectId: string | null; lowBalanceThreshold: number }>[];
};
export type PullPage = { cursor: number; hasMore: boolean; changes: SyncChanges };

export type PushOp =
  | { opId: string; kind: "create"; tx: Record<string, unknown> }
  | { opId: string; kind: "update"; txId: string; changes: object; base?: object; editedAt?: string }
  | { opId: string; kind: "delete"; txId: string };

export type PushResult = { opId: string } & (
  | { status: "applied"; data?: Transaction; replayed?: boolean; resolution?: string }
  | { status: "invalid"; error: string; fieldErrors?: Record<string, string> }
  | { status: "conflict"; error: string; data: Transaction; resolution?: string }
  | { status: "unavailable"; error: string }
  | { status: "not_found"; error: string }
);

/** Perbarui token bila sisa masa berlakunya kurang dari ini. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
let token: { value: string; expiresAt: number } | null = null;

function deviceHeaders(): Record<string, string> {
  const device = getDeviceInfo();
  return {
    "x-device-id": device.id,
    "x-device-label": device.label,
    "x-device-platform": device.platform,
  };
}

async function getToken(force = false): Promise<string | null> {
  if (!force && token && token.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return token.value;
  const res = await fetch("/api/sync/token", { method: "POST", headers: deviceHeaders() });
  if (!res.ok) {
    token = null;
    return null;
  }
  const { data } = (await res.json()) as { data: { token: string; expiresAt: string } };
  token = { value: data.token, expiresAt: Date.parse(data.expiresAt) };
  return token.value;
}

/** Panggil hub dengan token; bila ditolak karena token kedaluwarsa/tidak valid, coba sekali lagi. */
async function hubFetch(path: string, init: RequestInit = {}): Promise<Response> {
  for (const force of [false, true]) {
    const bearer = await getToken(force);
    const res = await fetch(path, {
      ...init,
      headers: {
        ...deviceHeaders(),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (res.status !== 401 || force) return res;
    token = null; // token ditolak → ambil baru lalu ulangi
  }
  throw new Error("tidak terjangkau");
}

/** Satu halaman perubahan sejak `since`. "retry" = jaringan / server bermasalah. */
export async function pullPage(since: number): Promise<PullPage | "retry"> {
  try {
    const res = await hubFetch(`/api/sync/pull?since=${since}`);
    if (!res.ok) return "retry";
    return ((await res.json()) as { data: PullPage }).data;
  } catch {
    return "retry";
  }
}

/** Kirim antrean sekaligus. Hasil per perubahan, urutan sama; "retry" = belum terkirim. */
export async function pushOps(ops: PushOp[]): Promise<PushResult[] | "retry"> {
  try {
    const res = await hubFetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({ sentAt: new Date().toISOString(), ops }),
    });
    if (!res.ok) return "retry";
    return ((await res.json()) as { data: { results: PushResult[] } }).data.results;
  } catch {
    return "retry";
  }
}

/** Untuk tes / keluar akun: lupakan token yang tersimpan di memori. */
export function forgetSyncToken() {
  token = null;
}
