import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";

import { QuickAddButton } from "@/components/dashboard/quick-add-button";
import { LocalTransactionCount, LocalTransactions } from "@/components/local/local-transactions";
import { ActiveProjectChip } from "@/components/proyek/active-project-chip";
import { getCurrentUserId } from "@/server/current-user";
import { getReceiptsByTransaction } from "@/server/receipts";
import { getReplicaSnapshot } from "@/server/replica-snapshot";

export const metadata = { title: "Transaksi · UangLapangan" };

export default async function TransaksiPage() {
  await connection();
  const userId = await getCurrentUserId();
  const snapshot = await getReplicaSnapshot(userId);
  if (!snapshot) redirect("/");

  const receiptsByTransaction = await getReceiptsByTransaction(
    userId,
    snapshot.transactions.map((t) => t.id),
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-24">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Kembali ke dashboard"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Transaksi</h1>
          <p className="text-sm text-muted-foreground">
            <LocalTransactionCount snapshot={snapshot} />
          </p>
        </div>
      </header>

      <ActiveProjectChip project={snapshot.project} label="Proyek aktif" />

      <LocalTransactions snapshot={snapshot} receiptsByTransaction={receiptsByTransaction} />

      <QuickAddButton returnTo="/transaksi" />
    </main>
  );
}
