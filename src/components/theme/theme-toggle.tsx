"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { readThemeChoice, setThemeChoice, subscribeTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "terang", label: "Terang", icon: Sun },
  { value: "gelap", label: "Gelap", icon: Moon },
  { value: "sistem", label: "Ikuti HP", icon: Monitor },
];

/** Pilihan tema: terang / gelap / ikuti pengaturan perangkat. */
export function ThemeToggle({ className }: { className?: string }) {
  const choice = useSyncExternalStore(subscribeTheme, readThemeChoice, () => "sistem" as const);
  return (
    <div role="radiogroup" aria-label="Tampilan" className={cn("grid grid-cols-3 gap-1 rounded-xl bg-muted p-1", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setThemeChoice(value)}
            className={cn(
              "flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
              active ? "bg-background shadow-sm ring-1 ring-foreground/10" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
