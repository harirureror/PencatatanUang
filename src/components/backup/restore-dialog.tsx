"use client";

import { useActionState, useState } from "react";
import { ArchiveRestore, TriangleAlert } from "lucide-react";

import { restoreFromArchive, type RestoreState } from "@/app/backup/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RESTORE_CONFIRM_WORD } from "@/lib/backup";
import { useOnline, useOutbox } from "@/lib/local/replica-store";
import type { BackupArchive } from "@/lib/backup";

const dateTime = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

const initialState: RestoreState = {};

/**
 * Tombol + dialog konfirmasi pemulihan dari satu arsip. Pemulihan menimpa data di server,
 * jadi pengguna harus mengetik kata konfirmasi, dan disarankan membackup kondisi sekarang dulu.
 */
export function RestoreDialog({ archive }: { archive: BackupArchive }) {
  const online = useOnline();
  const pending = useOutbox().length;
  const [state, formAction, restoring] = useActionState(restoreFromArchive, initialState);
  const [confirm, setConfirm] = useState("");
  const [backupFirst, setBackupFirst] = useState(true);
  const blocked = !online || pending > 0;
  const confirmed = confirm.trim().toUpperCase() === RESTORE_CONFIRM_WORD;
  const when = dateTime.format(new Date(archive.createdAt));

  if (state.ok) {
    return (
      <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
        {state.message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setConfirm("");
        }}
      >
        <AlertDialogTrigger
          disabled={blocked}
          render={<Button variant="outline" size="sm" className="h-9 w-full" />}
        >
          <ArchiveRestore aria-hidden />
          Pulihkan dari arsip ini
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <TriangleAlert />
            </AlertDialogMedia>
            <AlertDialogTitle>Pulihkan data dari arsip ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua data di server akan <strong>diganti</strong> dengan isi arsip {when} (
              {archive.projectCount} proyek, {archive.transactionCount} catatan). Catatan yang dibuat
              atau diubah setelah waktu itu akan hilang dari semua perangkat.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="archiveId" value={archive.id} />
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-input px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="backupFirst"
                checked={backupFirst}
                onChange={(e) => setBackupFirst(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
              />
              <span>
                <span className="font-medium">Backup data sekarang dulu</span>
                <span className="block text-xs text-muted-foreground">
                  Disarankan — agar kondisi saat ini masih bisa dikembalikan.
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`confirm-${archive.id}`} className="text-sm">
                Ketik <strong className="font-mono">{RESTORE_CONFIRM_WORD}</strong> untuk melanjutkan
              </label>
              <Input
                id={`confirm-${archive.id}`}
                name="confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                className="h-10 font-mono uppercase"
              />
            </div>

            {state.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel className="h-10">Batal</AlertDialogCancel>
              <Button
                type="submit"
                disabled={!confirmed || restoring}
                className="h-10 bg-destructive text-white hover:bg-destructive/85"
              >
                {restoring ? "Memulihkan…" : "Pulihkan data"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {blocked && (
        <p className="text-[11px] text-muted-foreground">
          {!online
            ? "Pemulihan butuh koneksi internet."
            : `Tunggu ${pending} perubahan offline terkirim dulu agar tidak ada yang hilang.`}
        </p>
      )}
    </div>
  );
}
