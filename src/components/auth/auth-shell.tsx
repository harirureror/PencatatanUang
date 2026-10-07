import type { ReactNode } from "react";
import { Wallet } from "lucide-react";

/** Kerangka halaman akun (masuk / daftar / atur ulang sandi): merek, judul, isi, kaki. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Wallet className="size-6" aria-hidden />
        </span>
        <p className="text-sm font-semibold tracking-wide text-primary">UangLapangan</p>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-background p-5 ring-1 ring-foreground/10">{children}</div>
      {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
    </main>
  );
}
