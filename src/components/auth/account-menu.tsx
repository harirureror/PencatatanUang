"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FolderKanban, HardDriveDownload, LogOut, Settings2 } from "lucide-react";

import { SignOutConfirm } from "@/components/auth/sign-out-confirm";
import { useSession } from "@/components/auth/use-session";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatPhone } from "@/lib/auth-rules";

const LINKS = [
  { href: "/pengaturan", label: "Pengaturan", icon: Settings2 },
  { href: "/proyek", label: "Kelola proyek", icon: FolderKanban },
  { href: "/backup", label: "Backup data", icon: HardDriveDownload },
] as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/**
 * Tombol akun di header: siapa yang masuk, tema, pintasan pengaturan, dan Keluar. Sebelum keluar,
 * peringatkan bila masih ada perubahan yang belum terkirim ke server.
 */
export function AccountMenu() {
  const user = useSession();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const contact = user.email ?? (user.phone ? formatPhone(user.phone) : "");

  function changeOpen(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (!next) setConfirming(false);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/25 hover:bg-primary/15"
          />
        }
      >
        <span aria-hidden>{initials(user.name)}</span>
        <span className="sr-only">Akun {user.name}</span>
      </DialogTrigger>
      <DialogContent>
        {!confirming ? (
          <>
            <DialogHeader className="flex-row items-center gap-3 text-left">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <DialogTitle className="truncate">{user.name}</DialogTitle>
                <DialogDescription className="truncate">{contact}</DialogDescription>
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Tampilan</p>
              <ThemeToggle />
            </div>
            <nav aria-label="Pengaturan akun" className="-mx-1 flex flex-col">
              {LINKS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex h-11 items-center gap-3 rounded-lg px-2 hover:bg-muted"
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  <span className="flex-1">{label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </nav>
            <Button variant="outline" className="h-11 text-destructive hover:text-destructive" onClick={() => setConfirming(true)}>
              <LogOut aria-hidden />
              Keluar
            </Button>
          </>
        ) : (
          <SignOutConfirm onCancel={() => setConfirming(false)} onBusyChange={setBusy} />
        )}
      </DialogContent>
    </Dialog>
  );
}
