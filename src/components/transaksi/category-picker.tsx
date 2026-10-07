"use client";

import { useRef, type KeyboardEvent } from "react";

import { CategoryIcon } from "@/lib/category-icons";
import type { Category, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

type CategoryPickerProps = {
  categories: Category[];
  value: string;
  onChange: (categoryId: string) => void;
  type: TransactionType;
  label: string;
  /** Nama field tersembunyi yang ikut terkirim bersama form. */
  name?: string;
  error?: string;
};

export function CategoryPicker({
  categories,
  value,
  onChange,
  type,
  label,
  name = "categoryId",
  error,
}: CategoryPickerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = categories.findIndex((c) => c.id === value);
  // Roving tabindex: hanya satu tombol yang bisa di-Tab, sisanya lewat tombol panah.
  const focusableIndex = selectedIndex >= 0 ? selectedIndex : 0;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (index + step + categories.length) % categories.length;
    onChange(categories[next].id);
    refs.current[next]?.focus();
  }

  const selectedStyle =
    type === "income"
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-primary bg-primary text-primary-foreground";

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div
        role="radiogroup"
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        className="grid grid-cols-2 gap-2"
      >
        {categories.map((c, i) => {
          const selected = c.id === value;
          return (
            <button
              key={c.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={i === focusableIndex ? 0 : -1}
              onClick={() => onChange(c.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "flex h-12 items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? selectedStyle : "border-input bg-background hover:bg-muted",
              )}
            >
              <CategoryIcon
                categoryId={c.id}
                className={cn("size-4 shrink-0", !selected && "text-muted-foreground")}
                aria-hidden
              />
              <span className="truncate">{c.name}</span>
            </button>
          );
        })}
      </div>
      {error && (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
