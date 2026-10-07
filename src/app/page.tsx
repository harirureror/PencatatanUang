import Link from "next/link";
import { connection } from "next/server";
import { ChartColumnBig, Settings2 } from "lucide-react";

import { AccountMenu } from "@/components/auth/account-menu";
import { NoActiveProject } from "@/components/dashboard/no-active-project";
import { QuickAddButton } from "@/components/dashboard/quick-add-button";
import { LocalDashboard } from "@/components/local/local-dashboard";
import { Notifications } from "@/components/notifications/notifications";
import { SyncBadge } from "@/components/local/sync-badge";
import { PullToRefresh } from "@/components/native/pull-to-refresh";
import { getCurrentUserId } from "@/server/current-user";
import { getReceiptsByTransaction } from "@/server/receipts";
import { getReplicaSnapshot } from "@/server/replica-snapshot";

function RekapLink() {
  return (
    <Link
      href="/rekap"
      aria-label="Rekap laporan"
      title="Rekap laporan"
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted hover:text-foreground"
    >
      <ChartColumnBig className="size-5" aria-hidden />
    </Link>
  );
}

function SettingsLink() {
  return (
    <Link
      href="/pengaturan"
      aria-label="Pengaturan"
      title="Pengaturan"
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted hover:text-foreground"
    >
      <Settings2 className="size-5" aria-hidden />
    </Link>
  );
}

export default async function DashboardPage() {
  await connection();
  const userId = await getCurrentUserId();
  const snapshot = await getReplicaSnapshot(userId);

  if (!snapshot) {
    return (
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-6">
        <h1 className="sr-only">UangLapangan</h1>
        <div className="absolute top-6 right-4">
          <SettingsLink />
        </div>
        <NoActiveProject />
      </main>
    );
  }

  const { project } = snapshot;
  const receiptsByTransaction = await getReceiptsByTransaction(
    userId,
    snapshot.transactions.slice(0, 5).map((t) => t.id),
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-6 pb-24">
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Proyek aktif
            <Link
              href="/proyek"
              className="rounded-full px-2 py-0.5 tracking-normal text-primary normal-case ring-1 ring-primary/30 hover:bg-primary/10"
            >
              Ganti
            </Link>
          </p>
          <h1 className="text-lg leading-tight font-semibold">{project.name}</h1>
          {project.client && (
            <p className="text-sm text-muted-foreground">{project.client}</p>
          )}
        </div>
        <SyncBadge />
        <RekapLink />
        <AccountMenu />
      </header>

      <Notifications userId={userId} />

      <PullToRefresh>
        <div className="flex flex-col gap-4">
          <LocalDashboard snapshot={snapshot} receiptsByTransaction={receiptsByTransaction} />
        </div>
      </PullToRefresh>

      <QuickAddButton />
    </main>
  );
}
