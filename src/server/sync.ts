// Sinkronisasi multi-perangkat lewat hub (DB pusat / Turso):
// - pull: perangkat menarik semua baris yang berubah sejak kursornya (rev > kursor), termasuk
//   baris terhapus (deleted_at), lalu menyimpan kursor baru;
// - push: perangkat mengirim antrean perubahannya sekaligus; tiap perubahan diproses dengan
//   aturan yang sama dengan REST (idempoten, deteksi bentrok lewat `base`).
// Setiap panggilan juga mencatat perangkat di sync_devices (kursor, waktu tarik/kirim).
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  projects,
  receipts,
  settings,
  syncDevices,
  transactions,
  type SyncDeviceRow,
} from "@/db/schema";
import type { Category, Project, Receipt, Transaction } from "@/lib/types";
import { toCategory } from "@/server/categories";
import { getCurrentUserId, NotSignedInError } from "@/server/current-user";
import { toProject } from "@/server/projects";
import { toReceipt } from "@/server/receipts";
import { applyCreate, applyDelete, applyUpdate, type OpResult } from "@/server/transaction-ops";
import { verifySyncToken } from "@/server/sync-token";
import { isClientId, toTransaction } from "@/server/transactions";

// ---- Perangkat ---------------------------------------------------------------------------

export type DevicePlatform = SyncDeviceRow["platform"];
export type DeviceInfo = { id: string; label: string; platform: DevicePlatform };

const PLATFORMS: DevicePlatform[] = ["web", "android", "desktop"];
const MAX_LABEL = 60;

/**
 * Identitas perangkat dari header: X-Device-Id (UUID buatan perangkat, wajib),
 * X-Device-Label (mis. "HP Android Budi") dan X-Device-Platform (web | android | desktop).
 */
export function parseDevice(request: Request): DeviceInfo | { error: string } {
  const id = request.headers.get("x-device-id");
  if (!isClientId(id)) return { error: "Header X-Device-Id wajib berisi UUID perangkat." };
  const platform = (request.headers.get("x-device-platform") ?? "web") as DevicePlatform;
  if (!PLATFORMS.includes(platform)) {
    return { error: 'X-Device-Platform harus "web", "android", atau "desktop".' };
  }
  const label = (request.headers.get("x-device-label") ?? "").trim().slice(0, MAX_LABEL);
  return { id, platform, label: label || "Perangkat" };
}

/** id perangkat dipakai pengguna lain, atau aksesnya sudah dicabut. */
export class DeviceRejectedError extends Error {}

/** Daftarkan / perbarui perangkat milik pengguna (menolak id milik akun lain / dicabut). */
export async function touchDevice(
  userId: string,
  device: DeviceInfo,
  patch: Partial<Pick<SyncDeviceRow, "lastPulledRev" | "lastPulledAt" | "lastPushedAt">> = {},
): Promise<void> {
  const now = new Date().toISOString();
  const [existing] = await db.select().from(syncDevices).where(eq(syncDevices.id, device.id)).limit(1);
  if (existing && existing.userId !== userId) {
    throw new DeviceRejectedError("id perangkat sudah dipakai akun lain.");
  }
  if (existing?.revokedAt) throw new DeviceRejectedError("Akses sinkron perangkat ini sudah dicabut.");
  const values = { label: device.label, platform: device.platform, lastSeenAt: now, ...patch };
  if (existing) {
    await db.update(syncDevices).set(values).where(eq(syncDevices.id, device.id));
  } else {
    await db.insert(syncDevices).values({ id: device.id, userId, ...values });
  }
}

// ---- Autentikasi sinkron ------------------------------------------------------------------

export type SyncAuth =
  | { userId: string; via: "token" | "session" }
  | { error: string; status: 401; code: "token_expired" | "token_invalid" | "unauthenticated" };

/**
 * Pengguna pemanggil /api/sync/*: dari token sinkron (Authorization: Bearer …, dipakai aplikasi
 * Android/desktop) atau dari sesi login di browser. Token hanya berlaku untuk perangkat yang
 * namanya tertulis di token itu.
 */
export async function resolveSyncAuth(request: Request, device: DeviceInfo): Promise<SyncAuth> {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const claims = verifySyncToken(header.slice(7).trim());
    if ("error" in claims) {
      return claims.error === "expired"
        ? { status: 401, code: "token_expired", error: "Token sinkron kedaluwarsa — minta token baru." }
        : { status: 401, code: "token_invalid", error: "Token sinkron tidak valid." };
    }
    if (claims.deviceId !== device.id) {
      return { status: 401, code: "token_invalid", error: "Token sinkron ini milik perangkat lain." };
    }
    return { userId: claims.userId, via: "token" };
  }
  try {
    return { userId: await getCurrentUserId(), via: "session" };
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return { status: 401, code: "unauthenticated", error: "Belum masuk — masuk dulu untuk menyinkronkan." };
    }
    throw error;
  }
}

// ---- Pull --------------------------------------------------------------------------------

type SyncFields = { rev: number; updatedAt: string; deletedAt: string | null };
export type Synced<T> = T & SyncFields;
export type SyncedSettings = Synced<{ activeProjectId: string | null; lowBalanceThreshold: number }>;

export type SyncChanges = {
  projects: Synced<Project>[];
  categories: Synced<Category>[];
  transactions: Synced<Transaction>[];
  receipts: Synced<Receipt>[];
  settings: SyncedSettings[];
};

export type PullResult = {
  /** Kursor baru: simpan, lalu kirim sebagai `since` pada tarikan berikutnya. */
  cursor: number;
  /** Masih ada perubahan setelah kursor ini — tarik lagi segera. */
  hasMore: boolean;
  changes: SyncChanges;
};

export const DEFAULT_PULL_LIMIT = 500;
export const MAX_PULL_LIMIT = 1000;

const syncFields = (r: { rev: number; updatedAt: string; deletedAt: string | null }): SyncFields => ({
  rev: r.rev,
  updatedAt: r.updatedAt,
  deletedAt: r.deletedAt,
});

/**
 * Perubahan milik pengguna dengan rev di (since, batas]. Batas dipilih supaya satu halaman
 * berisi paling banyak `limit` baris dari semua tabel, dan tidak memotong di tengah rev.
 */
export async function pullChanges(
  userId: string,
  device: DeviceInfo,
  since: number,
  limit = DEFAULT_PULL_LIMIT,
): Promise<PullResult> {
  // rev semua baris milik pengguna setelah kursor, urut naik, satu halaman.
  const revs = await db.all<{ rev: number }>(sql`
    SELECT rev FROM (
      SELECT rev FROM projects WHERE user_id = ${userId} AND rev > ${since}
      UNION ALL SELECT rev FROM categories WHERE (user_id IS NULL OR user_id = ${userId}) AND rev > ${since}
      UNION ALL SELECT rev FROM transactions WHERE user_id = ${userId} AND rev > ${since}
      UNION ALL SELECT r.rev FROM receipts r JOIN transactions t ON t.id = r.transaction_id
        WHERE t.user_id = ${userId} AND r.rev > ${since}
      UNION ALL SELECT rev FROM settings WHERE user_id = ${userId} AND rev > ${since}
    ) ORDER BY rev LIMIT ${limit + 1}
  `);

  const hasMore = revs.length > limit;
  const page = hasMore ? revs.slice(0, limit) : revs;
  const upper = page.length > 0 ? Number(page[page.length - 1].rev) : since;
  const range = <T extends { rev: Parameters<typeof gt>[0] }>(t: T) =>
    and(gt(t.rev, since), lte(t.rev, upper));

  const empty: SyncChanges = { projects: [], categories: [], transactions: [], receipts: [], settings: [] };
  let changes = empty;
  if (page.length > 0) {
    const [p, c, t, r, s] = await Promise.all([
      db.select().from(projects).where(and(eq(projects.userId, userId), range(projects))).orderBy(asc(projects.rev)),
      db
        .select()
        .from(categories)
        .where(and(or(isNull(categories.userId), eq(categories.userId, userId)), range(categories)))
        .orderBy(asc(categories.rev)),
      db
        .select()
        .from(transactions)
        .where(and(eq(transactions.userId, userId), range(transactions)))
        .orderBy(asc(transactions.rev)),
      db
        .select({ receipt: receipts })
        .from(receipts)
        .innerJoin(transactions, eq(transactions.id, receipts.transactionId))
        .where(and(eq(transactions.userId, userId), range(receipts)))
        .orderBy(asc(receipts.rev)),
      db.select().from(settings).where(and(eq(settings.userId, userId), range(settings))),
    ]);
    changes = {
      projects: p.map((row) => ({ ...toProject(row), ...syncFields(row) })),
      categories: c.map((row) => ({ ...toCategory(row), ...syncFields(row) })),
      transactions: t.map((row) => ({ ...toTransaction(row), ...syncFields(row) })),
      receipts: r.map(({ receipt }) => ({ ...toReceipt(receipt), ...syncFields(receipt) })),
      settings: s.map((row) => ({
        activeProjectId: row.activeProjectId,
        lowBalanceThreshold: row.lowBalanceThreshold,
        ...syncFields(row),
      })),
    };
  }

  await touchDevice(userId, device, { lastPulledRev: upper, lastPulledAt: new Date().toISOString() });
  return { cursor: upper, hasMore, changes };
}

// ---- Push --------------------------------------------------------------------------------

export type PushOp =
  | { opId: string; kind: "create"; tx: Record<string, unknown> }
  | {
      opId: string;
      kind: "update";
      txId: string;
      changes: Record<string, unknown>;
      base?: unknown;
      /** Waktu diubah di perangkat (jam perangkat) — untuk last-write-wins. */
      editedAt?: string;
    }
  | { opId: string; kind: "delete"; txId: string };

export type PushResult = { opId: string } & (
  | { status: "applied"; data?: Transaction; replayed?: boolean }
  | Exclude<OpResult, { status: "applied" }>
);

export const MAX_PUSH_OPS = 200;

/** Periksa bentuk satu perubahan dari antrean perangkat. */
export function parsePushOp(value: unknown): PushOp | null {
  if (!value || typeof value !== "object") return null;
  const op = value as Record<string, unknown>;
  if (typeof op.opId !== "string" || !op.opId) return null;
  const isObject = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (op.kind === "create" && isObject(op.tx)) return { opId: op.opId, kind: "create", tx: op.tx };
  if (op.kind === "update" && typeof op.txId === "string" && isObject(op.changes)) {
    return {
      opId: op.opId,
      kind: "update",
      txId: op.txId,
      changes: op.changes,
      base: op.base,
      editedAt: typeof op.editedAt === "string" ? op.editedAt : undefined,
    };
  }
  if (op.kind === "delete" && typeof op.txId === "string") {
    return { opId: op.opId, kind: "delete", txId: op.txId };
  }
  return null;
}

/**
 * Terapkan antrean perangkat berurutan. Satu perubahan yang gagal tidak menghentikan yang
 * lain — hasil per perubahan dikembalikan agar perangkat tahu mana yang perlu ditindaklanjuti.
 */
export async function pushChanges(
  userId: string,
  device: DeviceInfo,
  ops: PushOp[],
  /** Jam perangkat saat mengirim — untuk mengoreksi editedAt bila jam perangkat salah. */
  sentAt?: string,
): Promise<PushResult[]> {
  const results: PushResult[] = [];
  for (const op of ops) {
    if (op.kind === "create") {
      const r = await applyCreate(userId, op.tx);
      results.push({ opId: op.opId, ...r });
    } else if (op.kind === "update") {
      const raw = {
        ...op.changes,
        ...(op.base === undefined ? {} : { base: op.base }),
        editedAt: op.editedAt,
        sentAt,
      };
      results.push({ opId: op.opId, ...(await applyUpdate(userId, op.txId, raw)) });
    } else {
      // Sudah tidak ada (terhapus di perangkat lain) = tujuan tercapai → dianggap selesai.
      await applyDelete(userId, op.txId);
      results.push({ opId: op.opId, status: "applied" });
    }
  }
  if (results.some((r) => r.status === "applied")) {
    await touchDevice(userId, device, { lastPushedAt: new Date().toISOString() });
  } else {
    await touchDevice(userId, device);
  }
  return results;
}
