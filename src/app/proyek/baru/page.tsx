import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";

import { ProjectForm } from "@/components/proyek/project-form";
import { todayISO } from "@/lib/format";

export const metadata = { title: "Proyek baru · UangLapangan" };

export default async function ProyekBaruPage() {
  await connection();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-6">
      <header className="flex items-center gap-3">
        <Link
          href="/proyek"
          aria-label="Kembali ke daftar proyek"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Proyek baru</h1>
          <p className="text-sm text-muted-foreground">Wadah catatan uang untuk satu pekerjaan.</p>
        </div>
      </header>

      <ProjectForm today={todayISO()} />
    </main>
  );
}
