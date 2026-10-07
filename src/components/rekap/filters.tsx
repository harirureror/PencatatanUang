"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatTanggal, shiftISODate } from "@/lib/format";
import type { RekapPeriod, RekapProject } from "@/lib/rekap";
import { rangeError, rekapHref } from "@/lib/rekap-url";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<RekapProject["status"], string> = {
  aktif: "Berjalan",
  selesai: "Selesai",
  arsip: "Arsip",
};

/**
 * Pilih proyek yang direkap. Hanya mengubah tampilan rekap — proyek aktif (tempat catatan
 * baru masuk) tidak ikut berganti.
 */
export function ProjectFilter({
  projects,
  current,
  activeProjectId,
  period,
  date,
  from,
  to,
}: {
  projects: RekapProject[];
  current: RekapProject;
  activeProjectId: string | null;
  period: RekapPeriod;
  date: string;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const choose = (id: string) => {
    setOpen(false);
    // Proyek yang sudah selesai biasanya direkap utuh → buka sebagai rentang seluruh masa proyek.
    const p = projects.find((x) => x.id === id);
    const wholeProject = p && p.status !== "aktif" && period !== "rentang";
    router.replace(
      wholeProject
        ? rekapHref({ period: "rentang", from: p.startDate, to: p.endDate ?? p.startDate, project: id })
        : rekapHref({ period, date, from, to, project: id }),
      { scroll: false },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl bg-primary/8 px-3 py-2 text-left ring-1 ring-primary/25 hover:bg-primary/12"
          />
        }
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <FolderOpen className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted-foreground">
            Rekap proyek{current.id === activeProjectId ? " · proyek aktif" : ` · ${STATUS_LABEL[current.status]}`}
          </span>
          <span className="block truncate text-sm font-semibold">{current.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">Ganti proyek yang direkap</span>
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pilih proyek</DialogTitle>
          <DialogDescription>Hanya untuk melihat rekap — proyek aktif untuk mencatat tidak berubah.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1" role="listbox" aria-label="Proyek">
          {projects.map((p) => {
            const selected = p.id === current.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(p.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted",
                    selected && "bg-primary/8 ring-1 ring-primary/25",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {STATUS_LABEL[p.status]}
                      {p.id === activeProjectId && " · proyek aktif"} · {formatTanggal(p.startDate)}
                      {p.endDate ? ` – ${formatTanggal(p.endDate)}` : ""}
                    </span>
                  </span>
                  {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Atur rentang bebas: pilihan cepat (seluruh masa proyek, bulan ini, 30 hari terakhir) atau
 * tanggal awal–akhir sendiri.
 */
export function RangeFilter({
  project,
  from,
  to,
  today,
}: {
  project: RekapProject;
  from: string;
  to: string;
  today: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({ from, to });
  const [lastApplied, setLastApplied] = useState({ from, to });
  if (lastApplied.from !== from || lastApplied.to !== to) {
    // Rentang berubah dari luar (mis. pilihan cepat / tombol kembali) → isian ikut.
    setLastApplied({ from, to });
    setDraft({ from, to });
  }
  const error = rangeError(draft.from, draft.to, today);
  const go = (range: { from: string; to: string }) =>
    router.replace(rekapHref({ period: "rentang", ...range, project: project.id }), { scroll: false });

  const projectEnd = project.endDate && project.endDate < today ? project.endDate : today;
  const monthStart = `${today.slice(0, 8)}01`;
  const presets = [
    { label: "Seluruh proyek", from: project.startDate, to: projectEnd < project.startDate ? project.startDate : projectEnd },
    { label: "Bulan ini", from: monthStart, to: today },
    { label: "30 hari terakhir", from: shiftISODate(today, -29), to: today },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-background p-3 ring-1 ring-foreground/10">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pilihan cepat rentang">
        {presets.map((p) => {
          const selected = p.from === from && p.to === to;
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={selected}
              onClick={() => go(p)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
                selected ? "bg-foreground text-background ring-foreground" : "ring-foreground/15 hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <form
        className="grid grid-cols-2 items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!error) go(draft);
        }}
      >
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          Dari
          <input
            type="date"
            value={draft.from}
            max={today}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            aria-invalid={!!error}
            className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          Sampai
          <input
            type="date"
            value={draft.to}
            max={today}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            aria-invalid={!!error}
            className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          />
        </label>
        <Button type="submit" className="col-span-2 h-10" disabled={!!error || (draft.from === from && draft.to === to)}>
          Terapkan
        </Button>
        {error && (
          <p role="alert" className="col-span-3 text-xs text-destructive">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
