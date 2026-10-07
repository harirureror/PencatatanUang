import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";

import { SyncCenter } from "@/components/local/sync-center";
import { getBackupOverview } from "@/lib/mock-backups";
import { Notifications } from "@/components/notifications/notifications";
import { getCurrentUserId } from "@/server/current-user";
import { getReplicaSnapshot } from "@/server/replica-snapshot";

export const metadata = { title: "Sinkronisasi · UangLapangan" };

export default async function SinkronPage() {
  await connection();
  const snapshot = await getReplicaSnapshot(await getCurrentUserId());
  if (!snapshot) redirect("/");
  const { archives } = await getBackupOverview(await getCurrentUserId());
  const backupFailed = archives[0]?.status === "gagal";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Kembali ke dashboard"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Sinkronisasi</h1>
          <p className="text-sm text-muted-foreground">Data di perangkat & di server</p>
        </div>
      </header>

      <Notifications userId={await getCurrentUserId()} />

      <SyncCenter snapshot={snapshot} backupFailed={backupFailed} />
    </main>
  );
}
