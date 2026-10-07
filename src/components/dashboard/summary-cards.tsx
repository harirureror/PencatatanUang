import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Money, useFormatMoney } from "@/components/money/money-provider";

type SummaryCardsProps = {
  /** Dana awal proyek — ikut dihitung sebagai uang masuk. */
  budget: number;
  /** Pemasukan dari catatan (tanpa dana awal). */
  totalIncome: number;
  totalExpense: number;
};

export function SummaryCards({ budget, totalIncome, totalExpense }: SummaryCardsProps) {
  const formatMoney = useFormatMoney();
  return (
    <section aria-label="Ringkasan masuk dan keluar" className="grid grid-cols-2 gap-3">
      <SummaryCard
        label="Uang masuk"
        amount={budget + totalIncome}
        note={budget > 0 ? `termasuk dana awal ${formatMoney(budget)}` : undefined}
        icon={<ArrowDownLeft className="size-4" aria-hidden />}
        tone="income"
      />
      <SummaryCard
        label="Uang keluar"
        amount={totalExpense}
        icon={<ArrowUpRight className="size-4" aria-hidden />}
        tone="expense"
      />
    </section>
  );
}

function SummaryCard({
  label,
  amount,
  icon,
  tone,
  note,
}: {
  label: string;
  amount: number;
  note?: string;
  icon: ReactNode;
  tone: "income" | "expense";
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full",
              tone === "income"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
            )}
          >
            {icon}
          </span>
          {label}
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight tabular-nums">
            <Money amount={amount} />
          </p>
          {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
