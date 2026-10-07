import Link from "next/link";
import { Plus } from "lucide-react";

import { catatHref, type ReturnPath } from "@/lib/return-path";

/** Tombol catat cepat — menempel di bawah layar agar terjangkau jempol. */
export function QuickAddButton({ returnTo = "/" }: { returnTo?: ReturnPath }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md gap-2">
        <Link
          href={catatHref("expense", returnTo)}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
        >
          <Plus className="size-5" aria-hidden />
          Catat pengeluaran
        </Link>
        <Link
          href={catatHref("income", returnTo)}
          aria-label="Catat pemasukan"
          className="flex h-14 items-center justify-center gap-1 rounded-2xl bg-background px-4 text-sm font-semibold text-emerald-700 shadow-lg ring-1 ring-foreground/10 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98] dark:text-emerald-400"
        >
          <Plus className="size-4" aria-hidden />
          Masuk
        </Link>
      </div>
    </div>
  );
}
