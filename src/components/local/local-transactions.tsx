"use client";

import { useEffect } from "react";
import { ReceiptText } from "lucide-react";

import { SyncStatus } from "@/components/local/sync-status";
import { TransactionList } from "@/components/transaksi/transaction-list";
import { pendingTransactionIds } from "@/lib/local/outbox";
import type { Replica } from "@/lib/local/replica";
import { pullIntoReplica, useLocalReplica, useOutbox } from "@/lib/local/replica-store";
import type { Receipt } from "@/lib/types";

type LocalTransactionsProps = {
  snapshot: Replica;
  receiptsByTransaction: Record<string, Receipt[]>;
};

/** Jumlah catatan proyek aktif menurut replica perangkat (ikut berubah saat mencatat offline). */
export function LocalTransactionCount({ snapshot }: { snapshot: Replica }) {
  const { replica } = useLocalReplica(snapshot);
  return <>{(replica ?? snapshot).transactions.length} catatan</>;
}

/** Semua transaksi proyek aktif, dibaca dari replica di perangkat. */
export function LocalTransactions({ snapshot, receiptsByTransaction }: LocalTransactionsProps) {
  const { replica, onDevice } = useLocalReplica(snapshot);
  const outbox = useOutbox();
  useEffect(() => {
    pullIntoReplica(snapshot);
  }, [snapshot]);

  if (!replica) return null;

  return (
    <>
      <SyncStatus syncedAt={replica.syncedAt} onDevice={onDevice} />
      {replica.transactions.length > 0 ? (
        <TransactionList
          transactions={replica.transactions}
          categories={replica.categories}
          receiptsByTransaction={receiptsByTransaction}
          pendingIds={pendingTransactionIds(outbox)}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-background px-6 py-10 text-center">
          <ReceiptText className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">Belum ada transaksi</p>
          <p className="text-sm text-muted-foreground">
            Catatan uang masuk dan keluar proyek ini akan muncul di sini.
          </p>
        </div>
      )}
    </>
  );
}
