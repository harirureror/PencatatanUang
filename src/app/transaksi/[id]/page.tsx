import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ChevronRight, Paperclip } from "lucide-react";

import { DeleteTransactionButton } from "@/components/transaksi/delete-transaction-button";
import { TransactionForm } from "@/components/transaksi/transaction-form";
import { todayISO } from "@/lib/format";
import { strukHref, toReturnPath } from "@/lib/return-path";
import { listCategories } from "@/server/categories";
import { getMoneyFormatter } from "@/server/money";
import { getCurrentUserId } from "@/server/current-user";
import { countReceipts } from "@/server/receipts";
import { getTransaction } from "@/server/transactions";

export const metadata = { title: "Ubah catatan · UangLapangan" };

export default async function UbahTransaksiPage({
  params,
  searchParams,
}: PageProps<"/transaksi/[id]">) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const returnTo = toReturnPath(query.kembali ?? "/transaksi");
  const userId = await getCurrentUserId();
  const transaction = await getTransaction(userId, id);
  if (!transaction) notFound();

  const [categories, receiptCount] = await Promise.all([
    listCategories(userId, transaction.type),
    countReceipts(userId, transaction.id),
  ]);
  const categoryName = categories.find((c) => c.id === transaction.categoryId)?.name;
  const jenis = transaction.type === "income" ? "Pemasukan" : "Pengeluaran";
  const summary = [
    `${jenis} ${(await getMoneyFormatter())(transaction.amount)}`,
    transaction.description || categoryName,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-6">
      <header className="flex items-center gap-3">
        <Link
          href={returnTo}
          aria-label="Kembali"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Ubah {jenis.toLowerCase()}</h1>
          <p className="truncate text-sm text-muted-foreground">
            Perbaiki isian yang salah, lalu simpan.
          </p>
        </div>
      </header>

      <Link
        href={strukHref(transaction.id, returnTo)}
        className="flex items-center gap-3 rounded-xl bg-background px-4 py-3 ring-1 ring-foreground/10 hover:bg-muted"
      >
        <Paperclip className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-sm font-medium">Lampiran struk</span>
        <span className="text-sm text-muted-foreground">
          {receiptCount > 0 ? `${receiptCount} foto` : "Belum ada"}
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>

      <TransactionForm
        type={transaction.type}
        categories={categories}
        today={todayISO()}
        returnTo={returnTo}
        initial={transaction}
        existingReceiptCount={receiptCount}
        initialNoReceipt={transaction.noReceipt}
      />

      <DeleteTransactionButton id={transaction.id} summary={summary} returnTo={returnTo} />
    </main>
  );
}
