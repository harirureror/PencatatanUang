"use client";

import { useEffect, useState, useTransition } from "react";
import { CircleCheck, CloudUpload, Loader2, RotateCcw, TriangleAlert } from "lucide-react";

import { runBackupNow } from "@/app/backup/actions";
import { OnlineOnlyHint } from "@/components/local/online-only";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/image";
import { useOnline } from "@/lib/local/replica-store";
import type { BackupArchive } from "@/lib/backup";
import { cn } from "@/lib/utils";

// Tahapan yang ditampilkan selama backup berjalan (perkiraan; server memberi hasil akhir).
const STAGES = ["Menyiapkan data", "Mengompres arsip", "Mengunggah ke Google Drive"] as const;
const STAGE_MS = 500;

type BackupNowProps = {
  /** Arsip terakhir (berhasil maupun gagal) untuk notifikasi gagal. */
  latest: BackupArchive | null;
};

/** Tombol "Backup sekarang" + status unggah + notifikasi bila backup terakhir gagal. */
export function BackupNow({ latest }: BackupNowProps) {
  const online = useOnline();
  const [running, startBackup] = useTransition();
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<BackupArchive | null>(null);

  // Majukan tahapan selama berjalan (berhenti di tahap terakhir sampai server selesai).
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), STAGE_MS);
    return () => window.clearInterval(t);
  }, [running]);

  function start() {
    setResult(null);
    setStage(0);
    startBackup(async () => {
      setResult(await runBackupNow());
    });
  }

  const shown = result ?? latest;
  const failed = !running && shown?.status === "gagal";
  const progress = running ? Math.round(((stage + 1) / (STAGES.length + 1)) * 100) : 100;

  return (
    <div className="flex flex-col gap-2">
      {failed && shown && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive ring-1 ring-destructive/20"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">Backup terakhir gagal</p>
            <p className="text-xs">{shown.error}</p>
          </div>
        </div>
      )}

      {running ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-xl bg-background p-3 ring-1 ring-foreground/10">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
            {STAGES[stage]}…
          </p>
          <div
            role="progressbar"
            aria-label="Kemajuan backup"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
          <ol className="flex justify-between text-[11px] text-muted-foreground">
            {STAGES.map((s, i) => (
              <li key={s} className={cn(i <= stage && "font-medium text-foreground")}>
                {i + 1}. {s.split(" ")[0]}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        result?.status === "berhasil" && (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            Backup selesai — {result.projectCount} proyek, {result.transactionCount} catatan (
            {formatFileSize(result.sizeBytes)}).
          </p>
        )
      )}

      <Button className="h-12 text-base" disabled={running || !online} onClick={start}>
        {failed ? <RotateCcw aria-hidden /> : <CloudUpload aria-hidden />}
        {running ? "Sedang backup…" : failed ? "Coba lagi" : "Backup sekarang"}
      </Button>
      <OnlineOnlyHint action="Backup" />
    </div>
  );
}
