"use client";

import { CalendarDays } from "lucide-react";

import { formatTanggalPanjang, shiftISODate } from "@/lib/format";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  /** Hari ini menurut zona waktu pengguna (YYYY-MM-DD); batas atas pilihan. */
  today: string;
  id?: string;
  name?: string;
  label?: string;
  error?: string;
};

export function DatePicker({
  value,
  onChange,
  today,
  id = "transactionDate",
  name = "transactionDate",
  label = "Tanggal",
  error,
}: DatePickerProps) {
  const yesterday = shiftISODate(today, -1);
  const shortcuts = [
    { label: "Hari ini", date: today },
    { label: "Kemarin", date: yesterday },
  ];
  const isOther = value !== today && value !== yesterday;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {value && (
          <span className="text-xs text-muted-foreground">{formatTanggalPanjang(value)}</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            aria-pressed={value === s.date}
            onClick={() => onChange(s.date)}
            className={cn(
              "h-11 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              value === s.date
                ? "border-foreground/80 bg-foreground text-background"
                : "border-input bg-background hover:bg-muted",
            )}
          >
            {s.label}
          </button>
        ))}
        {/* Input tanggal asli HP ditampilkan transparan di atas tombol "Lainnya". */}
        <div
          className={cn(
            "relative flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors focus-within:ring-3 focus-within:ring-ring/50",
            isOther
              ? "border-foreground/80 bg-foreground text-background"
              : "border-input bg-background hover:bg-muted",
          )}
        >
          <CalendarDays className="size-4" aria-hidden />
          Lainnya
          <input
            id={id}
            name={name}
            type="date"
            value={value}
            max={today}
            required
            onChange={(e) => e.target.value && onChange(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
