import { eq } from "drizzle-orm";

import { db } from "@/db";
import { syncCounter } from "@/db/schema";
import { REPLICA_SCHEMA, type Replica } from "@/lib/local/replica";
import { listCategories } from "@/server/categories";
import { getActiveProjectWithSettings } from "@/server/projects";
import { listTransactions } from "@/server/transactions";

/**
 * Data proyek aktif untuk disalin ke replica di perangkat (tarik dari "hub").
 * Null bila belum ada proyek aktif.
 */
export async function getReplicaSnapshot(userId: string): Promise<Replica | null> {
  // Kursor dibaca SEBELUM data: perubahan yang terjadi selama snapshot dibuat punya rev lebih
  // besar dan akan ikut tarikan berikutnya — tidak ada yang terlewat (paling banyak terulang).
  const [counter] = await db.select({ value: syncCounter.value }).from(syncCounter).where(eq(syncCounter.id, 1));
  const { project, lowBalanceThreshold } = await getActiveProjectWithSettings(userId);
  if (!project) return null;

  const [{ items: transactions }, categories] = await Promise.all([
    listTransactions(userId, project.id),
    listCategories(userId),
  ]);

  return {
    schema: REPLICA_SCHEMA,
    syncedAt: new Date().toISOString(),
    project,
    lowBalanceThreshold,
    categories,
    transactions,
    cursor: counter?.value ?? 0,
  };
}
