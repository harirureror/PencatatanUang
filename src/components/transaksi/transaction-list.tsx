import Link from "next/link";
import { CloudUpload, TriangleAlert } from "lucide-react";

import { AttachmentButton } from "@/components/struk/attachment-button";
import { CategoryIcon } from "@/lib/category-icons";
import { formatTanggal } from "@/lib/format";
import { ubahHref, type ReturnPath } from "@/lib/return-path";
import type { Category, Receipt, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money/money-provider";

type TransactionListProps = {
  transactions: Transaction[];
  categories: Category[];
  /** Tampilkan total bersih per tanggal di judul grup. */
  showDailyTotal?: boolean;
  /** Halaman yang dituju setelah catatan diubah/dihapus. */
  returnTo?: ReturnPath;
  /** Foto bukti per id transaksi — transaksi berlampiran diberi penanda 📎. */
  receiptsByTransaction?: Record<string, Receipt[]>;
  /** false = baris hanya ditampilkan, tidak bisa dibuka untuk diubah. */
  interactive?: boolean;
  /** Id transaksi yang perubahannya belum terkirim ke server (dicatat saat offline). */
  pendingIds?: Set<string>;
};

/** Daftar transaksi, dikelompokkan per tanggal (urutan input dipertahankan). */
export function TransactionList({
  transactions,
  categories,
  showDailyTotal = true,
  returnTo = "/transaksi",
  receiptsByTransaction = {},
  interactive = true,
  pendingIds = new Set(),
}: TransactionListProps) {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = groups.get(t.transactionDate) ?? [];
    list.push(t);
    groups.set(t.transactionDate, list);
  }

  return (
    <div className="flex flex-col gap-5">
      {[...groups].map(([date, items]) => {
        const net = items.reduce((sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0);
        return (
          <section key={date} aria-label={formatTanggal(date)} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {formatTanggal(date)}
              </h2>
              {showDailyTotal && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  <span className="sr-only">Total bersih: </span>
                  {net > 0 ? "+" : net < 0 ? "−" : ""}
                  <Money amount={Math.abs(net)} />
                </p>
              )}
            </div>
            <ul className="divide-y overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
              {/* Perubahan yang belum terkirim belum ada di server, jadi belum bisa dibuka. */}
              {items.map((t) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  categoryName={categoryName.get(t.categoryId) ?? "Tanpa kategori"}
                  href={interactive && !pendingIds.has(t.id) ? ubahHref(t.id, returnTo) : null}
                  pending={pendingIds.has(t.id)}
                  receipts={receiptsByTransaction[t.id] ?? []}
                  noReceipt={t.noReceipt === true}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TransactionRow({
  transaction: t,
  categoryName,
  href,
  receipts,
  noReceipt,
  pending = false,
}: {
  transaction: Transaction;
  categoryName: string;
  href: string | null;
  receipts: Receipt[];
  noReceipt: boolean;
  pending?: boolean;
}) {
  const income = t.type === "income";
  const title = t.description || categoryName;
  const rowClass = cn(
    "flex min-w-0 flex-1 items-center gap-3 py-3 pl-4",
    receipts.length > 0 ? "pr-2" : "pr-4",
    href && "transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted active:bg-muted",
  );

  const content = (
    <>
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          income
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
        )}
      >
        <CategoryIcon categoryId={t.categoryId} className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {income ? "Pemasukan" : "Pengeluaran"}
          {t.description ? ` · ${categoryName}` : ""}
        </p>
        {(noReceipt || pending) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {pending && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                <CloudUpload className="size-3" aria-hidden />
                Belum tersinkron
              </span>
            )}
            {noReceipt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <TriangleAlert className="size-3" aria-hidden />
                Tanpa struk
              </span>
            )}
          </span>
        )}
      </div>
      <p
        className={cn(
          "text-sm font-semibold whitespace-nowrap tabular-nums",
          income ? "text-emerald-700 dark:text-emerald-400" : "text-foreground",
        )}
      >
        <span className="sr-only">{income ? "Masuk " : "Keluar "}</span>
        <span aria-hidden>{income ? "+" : "−"}</span>
        <Money amount={t.amount} />
      </p>
    </>
  );

  return (
    <li className="flex items-stretch">
      {href ? (
        <Link href={href} className={rowClass}>
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
      {receipts.length > 0 && <AttachmentButton receipts={receipts} title={title} />}
    </li>
  );
}
