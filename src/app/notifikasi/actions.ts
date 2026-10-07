"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserId } from "@/server/current-user";
import { dismissNotification as dismiss } from "@/server/notifications";

/** Tutup satu pemberitahuan (muncul lagi bila kejadiannya berulang). */
export async function dismissNotification(id: string): Promise<void> {
  await dismiss(await getCurrentUserId(), id);
  revalidatePath("/", "layout");
}
