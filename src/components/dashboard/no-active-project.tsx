import Link from "next/link";
import { FolderOpen, Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Tampilan dashboard saat belum ada proyek aktif. */
export function NoActiveProject() {
  return (
    <section
      aria-labelledby="tanpa-proyek"
      className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-background px-6 py-10 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <FolderOpen className="size-7" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <h2 id="tanpa-proyek" className="text-lg font-semibold">
          Belum ada proyek aktif
        </h2>
        <p className="text-sm text-muted-foreground">
          Buat proyek baru atau pilih proyek yang sudah ada untuk mulai mencatat uang lapangan.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Link href="/proyek/baru" className={cn(buttonVariants(), "h-12 text-base")}>
          <Plus aria-hidden />
          Buat proyek baru
        </Link>
        <Link
          href="/proyek"
          className={cn(buttonVariants({ variant: "outline" }), "h-12 text-base")}
        >
          Pilih proyek
        </Link>
      </div>
    </section>
  );
}
