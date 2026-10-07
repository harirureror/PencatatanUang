import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, FolderPlus, Plus } from "lucide-react";

import { ProjectCard } from "@/components/proyek/project-card";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUserId } from "@/server/current-user";
import { listProjectSummaries } from "@/server/projects";
import { cn } from "@/lib/utils";

export const metadata = { title: "Proyek · UangLapangan" };

export default async function ProyekPage() {
  await connection();
  const { projects, activeProjectId: activeId } = await listProjectSummaries(
    await getCurrentUserId(),
  );
  const active = projects.find((p) => p.id === activeId);
  const others = projects.filter((p) => p.id !== activeId);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Kembali ke dashboard"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">Proyek</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length > 0 ? `${projects.length} proyek` : "Belum ada proyek"}
          </p>
        </div>
        {projects.length > 0 && (
          <Link href="/proyek/baru" className={cn(buttonVariants(), "h-10 px-3")}>
            <Plus aria-hidden />
            Tambah
          </Link>
        )}
      </header>

      {projects.length > 0 ? (
        <>
          {active && (
            <section aria-labelledby="proyek-aktif" className="flex flex-col gap-2">
              <h2
                id="proyek-aktif"
                className="px-1 text-xs font-medium tracking-wide text-primary uppercase"
              >
                Proyek aktif
              </h2>
              <ProjectCard project={active} active />
            </section>
          )}
          {others.length > 0 && (
            <section aria-labelledby="proyek-lain" className="flex flex-col gap-2">
              {active && (
                <h2
                  id="proyek-lain"
                  className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  Proyek lainnya
                </h2>
              )}
              <ul className="flex flex-col gap-3" aria-label={active ? undefined : "Daftar proyek"}>
                {others.map((p) => (
                  <li key={p.id}>
                    <ProjectCard project={p} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section
          aria-labelledby="tanpa-proyek"
          className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-background px-6 py-12 text-center"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FolderPlus className="size-7" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="tanpa-proyek" className="text-lg font-semibold">
              Belum ada proyek
            </h2>
            <p className="text-sm text-muted-foreground">
              Buat proyek pertama — misalnya pemetaan atau site visit — lengkap dengan dana yang
              disiapkan kantor.
            </p>
          </div>
          <Link href="/proyek/baru" className={cn(buttonVariants(), "h-12 w-full text-base")}>
            <Plus aria-hidden />
            Buat proyek pertama
          </Link>
        </section>
      )}
    </main>
  );
}
