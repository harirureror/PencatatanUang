import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, Info } from "lucide-react";

import { DayPicker } from "@/components/rekap/day-picker";
import { ProjectFilter, RangeFilter } from "@/components/rekap/filters";
import { PrintExpander, ShareActions } from "@/components/rekap/share-actions";
import {
  CategoryBreakdown,
  DayBreakdown,
  DayTransactions,
  PeriodNav,
  PeriodTabs,
  RekapEmpty,
  RekapSummary,
  WeekInsights,
} from "@/components/rekap/rekap-view";
import { formatTanggalPanjang, todayISO } from "@/lib/format";
import { parseRekapParams } from "@/lib/rekap-url";
import { getCurrentUserId } from "@/server/current-user";
import { getRekap, getRekapProjects } from "@/server/rekap";

export const metadata = { title: "Rekap laporan · UangLapangan" };

/** Belum ada proyek sama sekali — rekap butuh minimal satu proyek. */
function NoProjects() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <h1 className="text-lg font-semibold">Rekap laporan</h1>
      <p className="text-sm text-muted-foreground">Buat proyek dulu supaya pemakaian dananya bisa direkap.</p>
      <Link href="/proyek" className="text-sm font-medium text-primary hover:underline">
        Kelola proyek
      </Link>
    </main>
  );
}

export default async function RekapPage({ searchParams }: PageProps<"/rekap">) {
  await connection();
  const today = todayISO();
  const userId = await getCurrentUserId();
  const { projects, activeProjectId } = await getRekapProjects(userId);
  if (projects.length === 0) return <NoProjects />;

  const { query, notice } = parseRekapParams(
    await searchParams,
    today,
    activeProjectId ?? projects[0].id,
    projects.map((p) => p.id),
  );
  const data = await getRekap(userId, query);
  if (!data) return <NoProjects />;
  const { period, date } = query;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Kembali ke dashboard"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted print:hidden"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Rekap laporan</h1>
          <p className="text-sm text-muted-foreground print:hidden">
            Ringkasan pemakaian dana per periode
          </p>
          <p className="hidden text-sm print:block">
            {data.project.name}
            {data.project.client ? ` · ${data.project.client}` : ""} — dicetak{" "}
            {formatTanggalPanjang(today)}
          </p>
        </div>
      </header>

      <PrintExpander />
      <div className="print:hidden">
        <ProjectFilter
          projects={projects}
          current={data.project}
          activeProjectId={activeProjectId}
          period={period}
          date={date}
          from={query.from}
          to={query.to}
        />
      </div>

      {notice && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-amber-50 print:hidden px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800"
        >
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {notice}
        </p>
      )}

      <div className="contents print:hidden">
        <PeriodTabs period={period} date={date} project={data.project.id} />
      </div>
      <PeriodNav data={data} date={date} today={today} />
      <div className="contents print:hidden">
        {period === "harian" && (
          <DayPicker
            date={date}
            today={today}
            week={data.week}
            project={data.project.id}
          />
        )}
        {period === "rentang" && (
          <RangeFilter
            project={data.project}
            from={data.period.start}
            to={data.period.end}
            today={today}
          />
        )}
      </div>

      {data.transactions.length === 0 ? (
        <RekapEmpty data={data} today={today} isActiveProject={data.project.id === activeProjectId} />
      ) : (
        <>
          <RekapSummary data={data} />
          {period !== "harian" && <WeekInsights data={data} />}
          <ShareActions data={data} />
          <CategoryBreakdown data={data} />
          {period === "harian" ? (
            <DayTransactions data={data} today={today} />
          ) : (
            <DayBreakdown data={data} today={today} />
          )}
        </>
      )}
    </main>
  );
}
