import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

/** Satu bagian halaman Pengaturan: judul kecil + kartu berisi baris-baris. */
export function SettingsSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="flex flex-col divide-y rounded-2xl bg-background ring-1 ring-foreground/10">{children}</div>
    </section>
  );
}

/** Baris yang membuka halaman lain: ikon, judul, keterangan, panah. */
export function SettingsLinkRow({
  href,
  icon: Icon,
  title,
  description,
  value,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  value?: ReactNode;
}) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 first:rounded-t-2xl last:rounded-b-2xl hover:bg-muted/60">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {description && <span className="block truncate text-xs text-muted-foreground">{description}</span>}
      </span>
      {value && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{value}</span>}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
