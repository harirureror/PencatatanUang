"use client";

import { useState, useTransition } from "react";
import { HardDriveUpload, Link2, Loader2, ShieldCheck, TriangleAlert, Unlink } from "lucide-react";

import { connectDriveSimulated, disconnectDrive } from "@/app/backup/actions";
import { OnlineOnlyHint } from "@/components/local/online-only";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useOnline } from "@/lib/local/replica-store";
import type { BackupOverview } from "@/lib/mock-backups";
import { cn } from "@/lib/utils";

/**
 * Status Google Drive + tombol hubungkan / putuskan. Menghubungkan = login Google (OAuth,
 * /api/drive/connect); tanpa konfigurasi OAuth (pengembangan) tersedia mode simulasi.
 */
export function DriveConnection({ drive }: { drive: BackupOverview["drive"] }) {
  const online = useOnline();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section
      aria-label="Google Drive"
      className="flex flex-col gap-3 rounded-2xl bg-background p-4 ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            drive.connected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <HardDriveUpload className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold">
            {drive.connected
              ? "Google Drive terhubung"
              : drive.needsReconnect
                ? "Google Drive perlu dihubungkan ulang"
                : "Google Drive belum terhubung"}
            {drive.connected && drive.mode === "simulasi" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Simulasi
              </span>
            )}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {drive.connected
              ? `${drive.account} · folder "${drive.folder}"`
              : drive.needsReconnect
                ? `${drive.account ?? "Akun Google"} — izin dicabut atau kedaluwarsa.`
                : "Backup otomatis belum berjalan."}
          </p>
        </div>
      </div>

      {drive.connected ? (
        <AlertDialog>
          <AlertDialogTrigger
            disabled={!online || pending}
            render={<Button variant="outline" size="sm" className="h-9 self-start" />}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Unlink aria-hidden />}
            Putuskan
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Putuskan Google Drive?</AlertDialogTitle>
              <AlertDialogDescription>
                Backup otomatis akan berhenti. Arsip yang sudah ada di Drive Anda tetap aman dan
                tidak dihapus.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-10">Batal</AlertDialogCancel>
              <Button
                className="h-10 bg-destructive text-white hover:bg-destructive/85"
                onClick={() => startTransition(() => disconnectDrive())}
              >
                Ya, putuskan
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
              Aplikasi hanya bisa melihat & menulis file backup buatannya sendiri — bukan isi
              Drive Anda yang lain.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
              Arsip disimpan di folder &ldquo;{drive.folder}&rdquo; milik Anda dan bisa diunduh kapan
              saja.
            </li>
          </ul>
          {drive.needsReconnect && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Backup otomatis berhenti karena Google menolak izin aplikasi. Hubungkan ulang untuk
              melanjutkan — arsip lama di Drive tetap ada.
            </p>
          )}
          {drive.oauthAvailable ? (
            // Navigasi penuh ke layar izin Google (bukan fetch) — kembali ke /backup?drive=…
            <a
              href="/api/drive/connect"
              aria-disabled={!online}
              className={cn(
                buttonVariants(),
                "h-11 text-base",
                !online && "pointer-events-none opacity-50",
              )}
            >
              <Link2 aria-hidden />
              {drive.needsReconnect ? "Hubungkan ulang Google Drive" : "Hubungkan Google Drive"}
            </a>
          ) : (
            <>
              <Button
                className="h-11 text-base"
                disabled={!online || pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await connectDriveSimulated();
                    setError(result.error ?? null);
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
                {pending ? "Menghubungkan…" : "Hubungkan (mode simulasi)"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Login Google belum dikonfigurasi di server (GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET).
                Mode simulasi hanya untuk mencoba alur backup — arsip tidak diunggah ke Drive.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </>
      )}
      <OnlineOnlyHint action="Mengatur Google Drive" />
    </section>
  );
}
