import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, CalendarDays, ReceiptText, Wallet } from "lucide-react";

import { MakeActiveButton } from "@/components/proyek/make-active-button";
import { ProjectStatusBadge, projectPeriod } from "@/components/proyek/project-card";
import { TransactionList } from "@/components/transaksi/transaction-list";
import { cn } from "@/lib/utils";
import { listCategories } from "@/server/categories";
import { getCurrentUserId } from "@/server/current-user";
import { getReceiptsByTransaction } from "@/server/receipts";
import { getActiveProject, getProjectSummary } from "@/server/projects";
import { listTransactions } from "@/server/transactions";
import { Money } from "@/components/money/money-provider";

export const metadata = { title: "Detail proyek · UangLapangan" };

export default async function DetailProyekPage({ params }: PageProps<"/proyek/[id]">) {
  await connection();
  const { id } = await params;
  const userId = await getCurrentUserId();
  const [project, { items: transactions }, activeProject, categories] = await Promise.all([
    getProjectSummary(userId, id),
    listTransactions(userId, id),
    getActiveProject(userId),
    listCategories(userId),
  ]);
  if (!project) notFound();
  const active = project.id === activeProject?.id;
  const receiptsByTransaction = await getReceiptsByTransaction(
    userId,
    transactions.map((t) => t.id),
  );

  const figures = [
    {
      label: "Uang masuk",
      value: project.budget + project.totalIncome,
      icon: ArrowDownLeft,
      tone: "text-emerald-700 dark:text-emerald-400",
    },
    {
      label: "Uang keluar",
      value: project.totalExpense,
      icon: ArrowUpRight,
      tone: "text-rose-700 dark:text-rose-400",
    },
    // Bagian dari uang masuk — ditampilkan terpisah sebagai keterangan.
    { label: "Dana awal", value: project.budget, icon: Wallet, tone: "text-muted-foreground" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <Link
          href="/proyek"
          aria-label="Kembali ke daftar proyek"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{project.name}</h1>
          {project.client && (
            <p className="truncate text-sm text-muted-foreground">{project.client}</p>
          )}
        </div>
      </header>

      <section
        aria-label="Ringkasan dana proyek"
        className={cn(
          "flex flex-col gap-4 rounded-2xl bg-background p-4",
          active ? "ring-2 ring-primary" : "ring-1 ring-foreground/10",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ProjectStatusBadge status={project.status} />
          {active && <span className="font-semibold text-primary">● Sedang dicatat</span>}
          <span className="ml-auto flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden />
            {projectPeriod(project)}
          </span>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Saldo akhir</p>
          <p
            className={cn(
              "text-3xl font-bold tracking-tight tabular-nums",
              project.balance < 0 && "text-destructive",
            )}
          >
            <Money amount={project.balance} />
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-2">
          {figures.map((f) => (
            <div key={f.label} className="flex flex-col gap-1 rounded-lg bg-muted/60 px-2.5 py-2">
              <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <f.icon className="size-3" aria-hidden />
                {f.label}
              </dt>
              <dd className={cn("text-sm font-semibold tabular-nums", f.tone)}>
                <Money amount={f.value} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {!active &&
        (project.status === "arsip" ? (
          <p className="rounded-xl bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
            Proyek ini sudah diarsipkan, jadi tidak bisa dijadikan proyek aktif.
          </p>
        ) : (
          <MakeActiveButton projectId={project.id} />
        ))}

      <section aria-labelledby="transaksi-proyek" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 id="transaksi-proyek" className="text-base font-semibold">
            Transaksi
          </h2>
          <p className="text-xs text-muted-foreground">{project.transactionCount} catatan</p>
        </div>
        {transactions.length > 0 ? (
          <TransactionList
            transactions={transactions}
            categories={categories}
            receiptsByTransaction={receiptsByTransaction}
            // Form ubah kembali ke daftar proyek aktif, jadi hanya catatan proyek aktif yang dibuka.
            interactive={active}
          />
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-dashed bg-background px-4 py-6 text-sm text-muted-foreground">
            <ReceiptText className="size-4" aria-hidden />
            Belum ada transaksi di proyek ini.
          </p>
        )}
      </section>
    </main>
  );
}
