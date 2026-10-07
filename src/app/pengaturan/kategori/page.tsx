import type { ReactNode } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";

import { AddCategoryForm } from "@/components/pengaturan/add-category-form";
import { CategoryRow } from "@/components/pengaturan/category-row";
import { countTransactionsByCategory, listCategories } from "@/server/categories";
import { getCurrentUserId } from "@/server/current-user";
import type { TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Atur kategori · UangLapangan" };

const TABS: { type: TransactionType; label: string; href: string }[] = [
  { type: "expense", label: "Pengeluaran", href: "/pengaturan/kategori" },
  { type: "income", label: "Pemasukan", href: "/pengaturan/kategori?jenis=pemasukan" },
];

export default async function AturKategoriPage({
  searchParams,
}: PageProps<"/pengaturan/kategori">) {
  await connection();
  const type: TransactionType =
    (await searchParams).jenis === "pemasukan" ? "income" : "expense";
  const userId = await getCurrentUserId();
  const [all, usage] = await Promise.all([listCategories(userId), countTransactionsByCategory(userId)]);
  const categories = all.filter((c) => c.type === type);
  const countOf = (t: TransactionType) => all.filter((c) => c.type === t).length;
  const custom = categories.filter((c) => !c.isDefault);
  const builtIn = categories.filter((c) => c.isDefault);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <Link
          href="/pengaturan"
          aria-label="Kembali ke Pengaturan"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Atur kategori</h1>
          <p className="text-sm text-muted-foreground">
            Sesuaikan pilihan kategori dengan kebiasaan di lapangan.
          </p>
        </div>
      </header>

      <nav aria-label="Jenis kategori" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {TABS.map((tab) => {
          const active = tab.type === type;
          return (
            <Link
              key={tab.type}
              href={tab.href}
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
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                {countOf(tab.type)}
              </span>
            </Link>
          );
        })}
      </nav>

      <AddCategoryForm key={type} type={type} />

      <CategorySection title="Buatan sendiri">
        {custom.length > 0 ? (
          custom.map((c) => (
            <CategoryRow key={c.id} category={c} usedCount={usage.get(c.id) ?? 0} />
          ))
        ) : (
          <li className="px-4 py-5 text-sm text-muted-foreground">
            Belum ada. Tambahkan kategori yang sering kamu pakai, mis.{" "}
            {type === "expense" ? "“Sewa perahu” atau “Porter”" : "“Reimburse klien” atau “Uang muka”"}.
          </li>
        )}
      </CategorySection>

      <CategorySection title="Bawaan">
        {builtIn.map((c) => (
          <CategoryRow key={c.id} category={c} usedCount={usage.get(c.id) ?? 0} />
        ))}
      </CategorySection>
    </main>
  );
}

function CategorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <ul className="divide-y overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
        {children}
      </ul>
    </section>
  );
}
