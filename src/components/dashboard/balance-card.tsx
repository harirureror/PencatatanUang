import { CalendarDays, TriangleAlert, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatTanggal } from "@/lib/format";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money/money-provider";

type BalanceCardProps = {
  project: Project;
  balance: number;
  lowBalanceThreshold: number;
};

export function isLowBalance(balance: number, threshold: number): boolean {
  return balance < threshold;
}

export function BalanceCard({ project, balance, lowBalanceThreshold }: BalanceCardProps) {
  const low = isLowBalance(balance, lowBalanceThreshold);
  const periode = project.endDate
    ? `${formatTanggal(project.startDate)} – ${formatTanggal(project.endDate)}`
    : `Mulai ${formatTanggal(project.startDate)}`;

  return (
    <section
      aria-labelledby="sisa-uang"
      className={cn(
        "rounded-2xl p-5 shadow-sm transition-colors",
        low ? "bg-orange-700 text-white dark:bg-orange-800" : "bg-primary text-primary-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm opacity-90">
          <Wallet className="size-4" aria-hidden />
          <h2 id="sisa-uang">Sisa uang proyek</h2>
        </div>
        {low && (
          <Badge className="h-6 bg-white px-2.5 text-orange-800">
            <TriangleAlert data-icon="inline-start" aria-hidden />
            Saldo menipis
          </Badge>
        )}
      </div>
      <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums">
        <Money amount={balance} />
      </p>
      {low && (
        <p role="status" className="mt-2 text-sm font-medium">
          Di bawah batas <Money amount={lowBalanceThreshold} /> — segera ajukan dana tambahan.
        </p>
      )}
      <div className="mt-4 flex flex-col gap-1 text-xs opacity-80">
        <p>Dana awal <Money amount={project.budget} /></p>
        <p className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" aria-hidden />
          {periode}
        </p>
      </div>
    </section>
  );
}
