"use client";

import { useState } from "react";
import { ChevronDown, CircleCheck, CircleX, FolderArchive, Loader2 } from "lucide-react";

import { RestoreDialog } from "@/components/backup/restore-dialog";
import { formatFileSize } from "@/lib/image";
import type { BackupArchive } from "@/lib/backup";
import { cn } from "@/lib/utils";

const dateTime = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

type Filter = "semua" | "berhasil" | "gagal";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "berhasil", label: "Berhasil" },
  { value: "gagal", label: "Gagal" },
];
const INITIAL_VISIBLE = 5;

type BackupArchiveListProps = {
  /** Arsip, terbaru dulu. */
  archives: BackupArchive[];
  /** Jumlah versi berhasil yang disimpan; sisanya dihapus otomatis saat backup berikutnya. */
  keepVersions: number;
};

/** Riwayat arsip backup: filter status, penanda terbaru & kebijakan simpan, rincian per arsip. */
export function BackupArchiveList({ archives, keepVersions }: BackupArchiveListProps) {
  const [filter, setFilter] = useState<Filter>("semua");
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Urutan arsip berhasil: 0 = terbaru. Yang ≥ keepVersions akan dihapus otomatis.
  const successRank = new Map(
    archives.filter((a) => a.status === "berhasil").map((a, i) => [a.id, i] as const),
  );
  const filtered = archives.filter((a) => filter === "semua" || a.status === filter);
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);
  const counts = {
    semua: archives.length,
    berhasil: successRank.size,
    gagal: archives.filter((a) => a.status === "gagal").length,
  };

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Saring arsip" className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => {
              setFilter(f.value);
              setShowAll(false);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors",
              filter === f.value
                ? "bg-foreground text-background ring-foreground"
                : "bg-background text-muted-foreground ring-foreground/15 hover:text-foreground",
            )}
          >
            {f.label} ({counts[f.value]})
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <ul className="divide-y overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          {visible.map((a) => {
            const ok = a.status === "berhasil";
            const running = a.status === "proses";
            const rank = successRank.get(a.id);
            const open = openId === a.id;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : a.id)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                      ok
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : running
                          ? "bg-primary/10 text-primary"
                          : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {ok ? (
                      <CircleCheck className="size-4" aria-hidden />
                    ) : running ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <CircleX className="size-4" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{dateTime.format(new Date(a.createdAt))}</span>
                      {rank === 0 && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          Terbaru
                        </span>
                      )}
                      {rank !== undefined && rank >= keepVersions && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Dihapus otomatis berikutnya
                        </span>
                      )}
                    </span>
                    {ok ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {a.projectCount} proyek · {a.transactionCount} catatan · {formatFileSize(a.sizeBytes)}
                      </span>
                    ) : running ? (
                      <span className="block text-xs text-primary">Sedang berjalan…</span>
                    ) : (
                      <span className="block text-xs text-destructive">Gagal — {a.error}</span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {open && (
                  <div className="flex flex-col gap-3 bg-muted/40 px-4 py-3 pl-15">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">File</dt>
                      <dd className="truncate font-mono">{a.fileName}</dd>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd>
                        {a.location === "drive"
                          ? "Berhasil — tersimpan di Google Drive"
                          : a.location === "server"
                            ? "Berhasil — hanya di server (mode simulasi, tidak diunggah)"
                            : running
                              ? "Sedang berjalan"
                              : "Gagal — tidak ada file"}
                      </dd>
                      {ok && (
                        <>
                          <dt className="text-muted-foreground">Isi</dt>
                          <dd>
                            {a.projectCount} proyek, {a.transactionCount} catatan transaksi
                            {a.receiptCount > 0 && `, ${a.receiptCount} lampiran struk`}
                          </dd>
                          <dt className="text-muted-foreground">Ukuran</dt>
                          <dd>{formatFileSize(a.sizeBytes)} (terkompresi)</dd>
                        </>
                      )}
                    </dl>
                    {ok && <RestoreDialog archive={a} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed bg-background px-4 py-6 text-sm text-muted-foreground">
          <FolderArchive className="size-4" aria-hidden />
          {archives.length === 0 ? "Belum ada arsip backup." : "Tidak ada arsip dengan status ini."}
        </p>
      )}

      {filtered.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="self-center rounded-full px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
        >
          {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua (${filtered.length})`}
        </button>
      )}
    </div>
  );
}
