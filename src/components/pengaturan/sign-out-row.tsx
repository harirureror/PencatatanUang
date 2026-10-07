"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { SignOutConfirm } from "@/components/auth/sign-out-confirm";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/** Baris "Keluar" di halaman Pengaturan (konfirmasi sama dengan menu akun). */
export function SignOutRow() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-destructive first:rounded-t-2xl last:rounded-b-2xl hover:bg-destructive/5"
          />
        }
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
          <LogOut className="size-4" aria-hidden />
        </span>
        <span className="text-sm font-medium">Keluar</span>
      </DialogTrigger>
      <DialogContent>
        <SignOutConfirm onCancel={() => setOpen(false)} onBusyChange={setBusy} />
      </DialogContent>
    </Dialog>
  );
}
