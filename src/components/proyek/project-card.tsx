import Link from "next/link";
import { CalendarDays, ChevronRight, CircleCheck, ReceiptText } from "lucide-react";

import { formatTanggal } from "@/lib/format";
import type { ProjectStatus, ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Money } from "@/components/money/money-provider";

// Status proyek (kolom projects.status). "aktif" ditampilkan sebagai "Berjalan" agar tidak
// tertukar dengan "proyek aktif" = proyek yang sedang dipakai mencatat.
const STATUS: Record<ProjectStatus, { label: string; className: string }> = {
  aktif: {
    label: "Berjalan",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  selesai: { label: "Selesai", className: "bg-muted text-foreground/70" },
  arsip: { label: "Diarsipkan", className: "bg-muted text-muted-foreground" },
};

export function projectPeriod(p: Pick<ProjectSummary, "startDate" | "endDate">): string {
  return p.endDate
    ? `${formatTanggal(p.startDate)} – ${formatTanggal(p.endDate)}`
    : `Mulai ${formatTanggal(p.startDate)}`;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", s.className)}>
      {s.label}
    </span>
  );
}

/** Kartu satu proyek di daftar: status, saldo, pemakaian dana, periode. */
export function ProjectCard({
  project: p,
  active = false,
}: {
  project: ProjectSummary;
  /** Proyek yang sedang dipakai mencatat — diberi bingkai & label khusus. */
  active?: boolean;
}) {
  const available = p.budget + p.totalIncome;
  const usedPct = available > 0 ? Math.min(100, Math.round((p.totalExpense / available) * 100)) : 0;
  const archived = p.status === "arsip";

  return (
    <Link
      href={`/proyek/${encodeURIComponent(p.id)}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-primary/[0.06] shadow-md ring-2 ring-primary hover:bg-primary/10"
          : "bg-background ring-1 ring-foreground/10 hover:bg-muted/50",
        archived && "opacity-75",
      )}
    >
      {active && (
        <p className="flex items-center gap-2 bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
          <CircleCheck className="size-4" aria-hidden />
          Sedang dicatat — transaksi baru masuk ke sini
          <span className="relative ml-auto flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground opacity-70 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-primary-foreground" />
          </span>
        </p>
      )}
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{p.name}</p>
            {p.client && <p className="truncate text-sm text-muted-foreground">{p.client}</p>}
          </div>
          <ProjectStatusBadge status={p.status} />
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Sisa uang</p>
            <p
              className={cn(
                "text-xl font-semibold tracking-tight tabular-nums",
                p.balance < 0 && "text-destructive",
              )}
            >
              <Money amount={p.balance} />
            </p>
          </div>
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            Terpakai <Money amount={p.totalExpense} />
            <br />
            dari <Money amount={available} />
          </p>
        </div>

        <div
          role="meter"
          aria-label="Pemakaian dana"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usedPct}
          aria-valuetext={`${usedPct}% dana terpakai`}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full",
              usedPct >= 90 ? "bg-orange-600" : "bg-primary",
              archived && "bg-muted-foreground/50",
            )}
            style={{ width: `${usedPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden />
            {projectPeriod(p)}
          </span>
          <span className="flex items-center gap-1">
            <ReceiptText className="size-3.5" aria-hidden />
            {p.transactionCount} catatan
          </span>
        </div>
      </div>
    </Link>
  );
}
