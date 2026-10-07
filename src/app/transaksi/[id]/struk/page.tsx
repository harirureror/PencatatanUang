import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ImageOff } from "lucide-react";

import { NewReceipts } from "@/components/struk/new-receipts";
import { ReceiptGallery } from "@/components/struk/receipt-gallery";
import { formatTanggal } from "@/lib/format";
import { toReturnPath, ubahHref } from "@/lib/return-path";
import { listCategories } from "@/server/categories";
import { getCurrentUserId } from "@/server/current-user";
import { listReceipts } from "@/server/receipts";
import { getTransaction } from "@/server/transactions";
import { Money } from "@/components/money/money-provider";

export const metadata = { title: "Lampiran struk · UangLapangan" };

export default async function LampiranStrukPage({
  params,
  searchParams,
}: PageProps<"/transaksi/[id]/struk">) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const returnTo = toReturnPath(query.kembali ?? "/transaksi");
  const userId = await getCurrentUserId();
  const transaction = await getTransaction(userId, id);
  if (!transaction) notFound();

  const [receipts, categories] = await Promise.all([
    listReceipts(userId, transaction.id).then((r) => r ?? []),
    listCategories(userId, transaction.type),
  ]);
  const categoryName = categories.find((c) => c.id === transaction.categoryId)?.name;
  const title = transaction.description || categoryName || "Transaksi";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <Link
          href={ubahHref(transaction.id, returnTo)}
          aria-label="Kembali ke catatan"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Lampiran struk</h1>
          <p className="truncate text-sm text-muted-foreground">{title}</p>
        </div>
      </header>

      <section
        aria-label="Ringkasan transaksi"
        className="flex items-center justify-between gap-3 rounded-xl bg-background px-4 py-3 ring-1 ring-foreground/10"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{categoryName ?? "Tanpa kategori"}</p>
          <p className="text-xs text-muted-foreground">{formatTanggal(transaction.transactionDate)}</p>
        </div>
        <p className="text-sm font-semibold tabular-nums">
          {transaction.type === "income" ? "+" : "−"}
          <Money amount={transaction.amount} />
        </p>
      </section>

      <section aria-labelledby="daftar-foto" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 id="daftar-foto" className="text-sm font-medium">
            Foto bukti
          </h2>
          <p className="text-xs text-muted-foreground">{receipts.length} foto</p>
        </div>

        {receipts.length > 0 ? (
          <ReceiptGallery receipts={receipts} title={title} />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-background px-6 py-10 text-center">
            <ImageOff className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">Belum ada foto struk</p>
            <p className="text-sm text-muted-foreground">
              Foto nota atau struk dari transaksi ini akan tampil di sini.
            </p>
          </div>
        )}
      </section>

      <NewReceipts transactionId={transaction.id} existingCount={receipts.length} />
    </main>
  );
}
