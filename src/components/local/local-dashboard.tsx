"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronRight, ReceiptText } from "lucide-react";

import { BalanceCard } from "@/components/dashboard/balance-card";
import { ExpenseDashboard } from "@/components/dashboard/expense-dashboard";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { SyncStatus } from "@/components/local/sync-status";
import { TransactionList } from "@/components/transaksi/transaction-list";
import { todayISO } from "@/lib/format";
import { pendingTransactionIds } from "@/lib/local/outbox";
import { summarizeReplica, type Replica } from "@/lib/local/replica";
import { pullIntoReplica, useLocalReplica, useOutbox } from "@/lib/local/replica-store";
import type { Receipt } from "@/lib/types";

type LocalDashboardProps = {
  /** Data terbaru dari server — ditarik ke replica perangkat saat halaman dibuka. */
  snapshot: Replica;
  /** Foto bukti transaksi terbaru (file disinkronkan terpisah, tidak masuk replica). */
  receiptsByTransaction: Record<string, Receipt[]>;
};

/** Saldo, ringkasan, dan transaksi terbaru — dibaca & dihitung dari replica di perangkat. */
export function LocalDashboard({ snapshot, receiptsByTransaction }: LocalDashboardProps) {
  const { replica, onDevice } = useLocalReplica(snapshot);
  const outbox = useOutbox();
  useEffect(() => {
    pullIntoReplica(snapshot);
  }, [snapshot]);

  if (!replica) return null;
  const { project, balance, totalIncome, totalExpense, lowBalanceThreshold } =
    summarizeReplica(replica);
  const recent = replica.transactions.slice(0, 5);

  return (
    <>
      <SyncStatus syncedAt={replica.syncedAt} onDevice={onDevice} className="-mt-1" />

      <BalanceCard project={project} balance={balance} lowBalanceThreshold={lowBalanceThreshold} />

      <SummaryCards budget={project.budget} totalIncome={totalIncome} totalExpense={totalExpense} />

      <ExpenseDashboard
        project={project}
        categories={replica.categories}
        transactions={replica.transactions}
        today={todayISO()}
      />

      <section aria-labelledby="transaksi-terbaru" className="mt-2 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="transaksi-terbaru" className="text-base font-semibold">
            Transaksi terbaru
          </h2>
          <Link
            href="/transaksi"
            className="flex items-center gap-0.5 text-sm font-medium text-primary hover:underline"
          >
            Lihat semua
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
        {recent.length > 0 ? (
          <TransactionList
            transactions={recent}
            categories={replica.categories}
            showDailyTotal={false}
            returnTo="/"
            receiptsByTransaction={receiptsByTransaction}
            pendingIds={pendingTransactionIds(outbox)}
          />
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-dashed bg-background px-4 py-6 text-sm text-muted-foreground">
            <ReceiptText className="size-4" aria-hidden />
            Belum ada transaksi di proyek ini.
          </p>
        )}
      </section>
    </>
  );
}
