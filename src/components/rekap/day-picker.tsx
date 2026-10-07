"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { formatTanggalPanjang } from "@/lib/format";
import type { RekapData } from "@/lib/rekap";
import { rekapHref } from "@/lib/rekap-url";
import { cn } from "@/lib/utils";

const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "short" });
const dayNum = (iso: string) => Number(iso.slice(8, 10));

/**
 * Pemilih tanggal rekap harian: strip Senin–Minggu (titik = ada catatan) untuk berpindah cepat,
 * plus kalender HP untuk lompat ke tanggal mana pun (sampai hari ini).
 */
export function DayPicker({
  date,
  today,
  week,
  project,
}: {
  date: string;
  today: string;
  week: RekapData["week"];
  project: string;
}) {
  const router = useRouter();
  const go = (d: string) => router.replace(rekapHref({ period: "harian", date: d, project }), { scroll: false });

  return (
    <div className="flex flex-col gap-2">
      <ol className="grid grid-cols-7 gap-1" aria-label="Pilih hari dalam minggu ini">
        {week.map((d) => {
          const selected = d.date === date;
          const future = d.date > today;
          return (
            <li key={d.date}>
              <button
                type="button"
                disabled={future}
                aria-pressed={selected}
                aria-label={`${formatTanggalPanjang(d.date)}${d.count ? ` · ${d.count} catatan` : " · tidak ada catatan"}${d.date === today ? " · hari ini" : ""}`}
                onClick={() => go(d.date)}
                className={cn(
                  "flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded-xl text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected
                    ? "bg-foreground text-background"
                    : "bg-background ring-1 ring-foreground/10 hover:bg-muted",
                  future && "opacity-40",
                )}
              >
                <span className={cn(!selected && "text-muted-foreground")}>{weekday.format(new Date(`${d.date}T00:00:00`))}</span>
                <span className={cn("text-base font-semibold tabular-nums", d.date === today && !selected && "text-primary")}>
                  {dayNum(d.date)}
                </span>
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", d.count > 0 ? (selected ? "bg-background" : "bg-primary") : "bg-transparent")}
                />
              </button>
            </li>
          );
        })}
      </ol>
      {/* Kalender asli HP, transparan di atas tombol. */}
      <label className="relative flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input bg-background text-sm font-medium hover:bg-muted focus-within:ring-3 focus-within:ring-ring/50">
        <CalendarDays className="size-4" aria-hidden />
        Pilih tanggal lain
        <input
          type="date"
          value={date}
          max={today}
          aria-label="Pilih tanggal rekap"
          onChange={(e) => e.target.value && e.target.value <= today && go(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
