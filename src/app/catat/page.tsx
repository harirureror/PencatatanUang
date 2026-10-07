import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";

import { ActiveProjectChip } from "@/components/proyek/active-project-chip";
import { TransactionForm } from "@/components/transaksi/transaction-form";
import { todayISO } from "@/lib/format";
import { listCategories } from "@/server/categories";
import { getCurrentUserId } from "@/server/current-user";
import { getActiveProject } from "@/server/projects";
import { catatHref, toReturnPath } from "@/lib/return-path";
import type { TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Catat transaksi · UangLapangan" };

const TABS: { type: TransactionType; label: string }[] = [
  { type: "expense", label: "Pengeluaran" },
  { type: "income", label: "Pemasukan" },
];

export default async function CatatPage({ searchParams }: PageProps<"/catat">) {
  await connection();
  const params = await searchParams;
  const returnTo = toReturnPath(params.kembali);
  const type: TransactionType = params.jenis === "pemasukan" ? "income" : "expense";
  const userId = await getCurrentUserId();
  const [project, categories] = await Promise.all([
    getActiveProject(userId),
    listCategories(userId, type),
  ]);
  // Tanpa proyek aktif tidak ada tempat mencatat — kembali ke dashboard (empty state).
  if (!project) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4">
      <header className="flex items-center gap-3">
        <Link
          href={returnTo}
          aria-label="Kembali"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-lg font-semibold">
          Catat {type === "income" ? "pemasukan" : "pengeluaran"}
        </h1>
      </header>

      <ActiveProjectChip project={project} />

      <nav aria-label="Jenis transaksi" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {TABS.map((tab) => {
          const active = tab.type === type;
          return (
            <Link
              key={tab.type}
              href={catatHref(tab.type, returnTo)}
              replace
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-background shadow-sm ring-1 ring-foreground/10"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <TransactionForm
        key={type}
        type={type}
        categories={categories}
        today={todayISO()}
        returnTo={returnTo}
      />
    </main>
  );
}
