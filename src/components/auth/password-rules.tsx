import { Check } from "lucide-react";

import { passwordChecks } from "@/lib/auth-rules";
import { cn } from "@/lib/utils";

/** Daftar periksa syarat kata sandi baru, diperbarui saat mengetik. */
export function PasswordRules({ id, password }: { id: string; password: string }) {
  return (
    <ul id={id} aria-label="Syarat kata sandi" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {passwordChecks(password).map((c) => (
        <li
          key={c.label}
          className={cn("flex items-center gap-1", c.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}
        >
          <Check className={cn("size-3.5", !c.ok && "opacity-30")} aria-hidden />
          {c.label}
          <span className="sr-only">{c.ok ? "(terpenuhi)" : "(belum)"}</span>
        </li>
      ))}
    </ul>
  );
}
