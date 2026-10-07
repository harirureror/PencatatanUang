import Link from "next/link";
import { FolderOpen } from "lucide-react";

import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

type ActiveProjectChipProps = {
  project: Pick<Project, "name" | "client">;
  /** Teks pengantar, mis. "Dicatat ke proyek". */
  label?: string;
  className?: string;
};

/**
 * Penanda proyek aktif — supaya pengguna selalu tahu catatan masuk ke proyek mana,
 * lengkap dengan jalan pintas untuk mengganti proyek.
 */
export function ActiveProjectChip({
  project,
  label = "Dicatat ke proyek",
  className,
}: ActiveProjectChipProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl bg-primary/8 px-3 py-2 ring-1 ring-primary/25",
        className,
      )}
    >
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <FolderOpen className="size-4" aria-hidden />
        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{project.name}</p>
      </div>
      <Link
        href="/proyek"
        className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/10"
      >
        Ganti
      </Link>
    </div>
  );
}
