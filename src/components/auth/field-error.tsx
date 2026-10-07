import type { ReactNode } from "react";

/** Pesan salah di bawah kolom form (dihubungkan lewat aria-describedby). */
export function FieldError({ id, message, children }: { id: string; message?: string; children?: ReactNode }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
      {children}
    </p>
  );
}

/** Pesan salah umum di atas form. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}
