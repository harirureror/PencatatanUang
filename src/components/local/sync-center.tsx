"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  CloudOff,
  FolderArchive,
  CloudUpload,
  Database,
  HardDrive,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Wifi,
  X,
} from "lucide-react";

import { Money, useFormatMoney } from "@/components/money/money-provider";
import { Button } from "@/components/ui/button";
import { formatTanggal } from "@/lib/format";
import type { FormatMoney } from "@/lib/money";
import { formatFileSize } from "@/lib/image";
import type { FailedOp, OutboxOp } from "@/lib/local/outbox";
import type { Replica } from "@/lib/local/replica";
import {
  dismissFailed,
  syncNow as syncWithHub,
  PULL_INTERVAL_MS,
  pullIntoReplica,
  resetDeviceData,
  resolveFailed,
  useFailedOps,
  useLocalReplica,
  useOnline,
  useOutbox,
  useReplicaStorage,
  useSyncState,
} from "@/lib/local/replica-store";
import { cn } from "@/lib/utils";

// Tanggal & jam sama-sama WIB (tanggal dari string ISO berzona UTC bisa meleset sehari).
const pushedDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const time = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

const dateTime = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/** Ringkasan satu perubahan antrean dalam bahasa sehari-hari. */
function describeOp(
  op: OutboxOp,
  replica: Replica | null,
  formatMoney: FormatMoney,
): { icon: typeof Plus; label: string; detail: string } {
  if (op.kind === "create") {
    return {
      icon: Plus,
      label: `Catat ${op.tx.type === "income" ? "pemasukan" : "pengeluaran"}`,
      detail: `${formatMoney(op.tx.amount)}${op.tx.description ? ` · ${op.tx.description}` : ""} · ${formatTanggal(op.tx.transactionDate)}`,
    };
  }
  if (op.kind === "update") {
    return {
      icon: Pencil,
      label: "Ubah catatan",
      detail: `${formatMoney(op.changes.amount)}${op.changes.description ? ` · ${op.changes.description}` : ""}`,
    };
  }
  const tx = replica?.transactions.find((t) => t.id === op.txId);
  return { icon: Trash2, label: "Hapus catatan", detail: tx ? formatMoney(tx.amount) : "Catatan dihapus" };
}

type Fields = { amount: number; categoryId: string; transactionDate: string; description: string };

/** Satu versi catatan dalam kotak perbandingan. */
function Version({ title, fields, replica }: { title: string; fields: Fields; replica: Replica | null }) {
  const category = replica?.categories.find((c) => c.id === fields.categoryId)?.name ?? "—";
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-background px-3 py-2 text-xs ring-1 ring-foreground/10">
      <p className="font-medium text-muted-foreground">{title}</p>
      <p className="text-sm font-semibold tabular-nums"><Money amount={fields.amount} /></p>
      <p className="truncate">{fields.description || category}</p>
      <p className="text-muted-foreground">
        {category} · {formatTanggal(fields.transactionDate)}
      </p>
    </div>
  );
}

/** Perubahan yang tidak bisa diterapkan server + pilihan penyelesaiannya. */
function FailedItem({
  item,
  replica,
  onResolve,
}: {
  item: FailedOp;
  replica: Replica | null;
  onResolve: (action: "discard" | "keep-mine" | "restore") => void;
}) {
  const kind = item.kind ?? "rejected";
  const formatMoney = useFormatMoney();
  const d = describeOp(item.op, replica, formatMoney);
  const op = item.op;

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-destructive/5 p-3 ring-1 ring-destructive/20">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">{d.label}</p>
          <p className="text-xs text-destructive">{item.reason}</p>
        </div>
      </div>

      {kind === "conflict" && op.kind === "update" && item.server && (
        <div className="grid grid-cols-2 gap-2">
          <Version title="Di server sekarang" fields={item.server} replica={replica} />
          <Version title="Perubahan Anda" fields={op.changes} replica={replica} />
        </div>
      )}
      {kind !== "conflict" && <p className="text-xs text-muted-foreground">{d.detail}</p>}

      <div className="flex flex-wrap gap-2">
        {kind === "conflict" && (
          <>
            <Button size="sm" className="h-9 flex-1" onClick={() => onResolve("keep-mine")}>
              Pakai versi saya
            </Button>
            <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => onResolve("discard")}>
              Pakai versi server
            </Button>
          </>
        )}
        {kind === "deleted" && (
          <>
            <Button size="sm" className="h-9 flex-1" onClick={() => onResolve("restore")}>
              Pulihkan sebagai catatan baru
            </Button>
            <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => onResolve("discard")}>
              Buang
            </Button>
          </>
        )}
        {kind === "rejected" && (
          <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => onResolve("discard")}>
            Buang perubahan ini
          </Button>
        )}
      </div>
    </li>
  );
}

/** Pemulihan: muat ulang data perangkat dari server (dengan konfirmasi). */
function ResetDeviceData({ pending, onReset }: { pending: number; onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (pending > 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Pemulihan data perangkat tersedia setelah semua perubahan terkirim.
      </p>
    );
  }
  return confirming ? (
    <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-sm ring-1 ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-800">
      <p>Data di perangkat ini akan dihapus lalu diambil ulang dari server. Lanjutkan?</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-9 flex-1"
          onClick={() => {
            setConfirming(false);
            onReset();
          }}
        >
          Ya, muat ulang
        </Button>
        <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => setConfirming(false)}>
          Batal
        </Button>
      </div>
    </div>
  ) : (
    <Button variant="outline" className="h-10" onClick={() => setConfirming(true)}>
      <RotateCcw aria-hidden />
      Muat ulang data perangkat dari server
    </Button>
  );
}

export function SyncCenter({
  snapshot,
  backupFailed = false,
}: {
  snapshot: Replica;
  /** Backup terakhir ke Google Drive gagal → beri tanda di tautan Backup. */
  backupFailed?: boolean;
}) {
  const formatMoney = useFormatMoney();
  const router = useRouter();
  const online = useOnline();
  const outbox = useOutbox();
  const failed = useFailedOps();
  const { replica, onDevice } = useLocalReplica(snapshot);
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, startSync] = useTransition();
  const auto = useSyncState();
  const storage = useReplicaStorage();

  useEffect(() => {
    pullIntoReplica(snapshot);
  }, [snapshot]);

  const deviceBytes = replica ? new Blob([JSON.stringify(replica), JSON.stringify(outbox)]).size : 0;

  function syncNow() {
    setMessage(null);
    startSync(async () => {
      const { sent, rejected, remaining, received, ok } = await syncWithHub();
      router.refresh(); // bagian halaman yang dirender server ikut segar
      const parts = [
        sent > 0 && `${sent} perubahan terkirim`,
        rejected > 0 && `${rejected} perlu tindakan (lihat di bawah)`,
        remaining > 0 && `${remaining} dicoba lagi nanti`,
      ].filter(Boolean);
      const pulled = !ok
        ? "Gagal menarik data terbaru — dicoba lagi otomatis."
        : received > 0
          ? `${received} perubahan dari perangkat lain diterima.`
          : "Data sudah yang terbaru.";
      setMessage(parts.length > 0 ? `${parts.join(", ")}. ${pulled}` : pulled);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-label="Status koneksi"
        className={cn(
          "flex items-center gap-3 rounded-2xl p-4 ring-1",
          online
            ? "bg-background ring-foreground/10"
            : "bg-amber-50 ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-800",
        )}
      >
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            online ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
          )}
        >
          {online ? <Wifi className="size-5" aria-hidden /> : <CloudOff className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{online ? "Online" : "Offline"}</p>
          <p className="text-sm text-muted-foreground">
            {replica
              ? `Sinkron terakhir ${dateTime.format(new Date(replica.syncedAt))}`
              : "Belum ada data di perangkat"}
            {!onDevice && " · menyimpan ke perangkat…"}
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <Button
          className="h-12 text-base"
          onClick={syncNow}
          disabled={!online || syncing || auto.syncing}
        >
          <RefreshCw className={cn((syncing || auto.syncing) && "animate-spin")} aria-hidden />
          {syncing || auto.syncing ? "Menyinkronkan…" : "Sinkron sekarang"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {online
            ? `Otomatis saat aplikasi dibuka, saat kembali online, dan tiap ${PULL_INTERVAL_MS / 60_000} menit${
                auto.nextPullAt ? ` — berikutnya sekitar ${time.format(new Date(auto.nextPullAt))}` : ""
              }.`
            : "Sinkron otomatis begitu perangkat kembali online."}
        </p>
        {message && (
          <p role="status" className="text-center text-sm text-primary">
            {message}
          </p>
        )}
      </div>

      <section aria-labelledby="antrean" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 id="antrean" className="text-sm font-semibold">
            Menunggu dikirim
          </h2>
          <span className="text-xs text-muted-foreground">{outbox.length} perubahan</span>
        </div>
        {outbox.length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
            {outbox.map((op) => {
              const d = describeOp(op, replica, formatMoney);
              return (
                <li key={op.opId} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    <d.icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{d.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.detail}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {dateTime.format(new Date(op.queuedAt))}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-background px-4 py-3 text-sm text-muted-foreground ring-1 ring-foreground/10">
            <CloudUpload className="size-4" aria-hidden />
            Semua perubahan sudah terkirim ke server.
          </p>
        )}
      </section>

      {failed.length > 0 && (
        <section aria-labelledby="perlu-tindakan" className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 id="perlu-tindakan" className="text-sm font-semibold text-destructive">
              Perlu tindakan ({failed.length})
            </h2>
            {failed.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  dismissFailed();
                  router.refresh();
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
                Buang semua
              </button>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {failed.map((f) => (
              <FailedItem
                key={f.op.opId}
                item={f}
                replica={replica}
                onResolve={(action) => {
                  resolveFailed(f.op.opId, action);
                  if (action === "discard") router.refresh(); // tampilkan lagi versi server
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="di-perangkat" className="flex flex-col gap-2">
        <h2 id="di-perangkat" className="px-1 text-sm font-semibold">
          Data di perangkat ini
        </h2>
        <dl className="grid grid-cols-2 gap-2">
          {[
            { icon: Database, label: "Proyek", value: replica?.project.name ?? "—" },
            { icon: HardDrive, label: "Catatan", value: `${replica?.transactions.length ?? 0} transaksi` },
            { icon: HardDrive, label: "Kategori", value: `${replica?.categories.length ?? 0}` },
            { icon: HardDrive, label: "Ukuran", value: formatFileSize(deviceBytes) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-background px-3 py-2.5 ring-1 ring-foreground/10">
              <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <item.icon className="size-3" aria-hidden />
                {item.label}
              </dt>
              <dd className="truncate text-sm font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p
          className={cn(
            "flex items-start gap-1.5 px-1 text-xs",
            storage?.kind === "sqlite" && !storage.error
              ? "text-muted-foreground"
              : "text-amber-700 dark:text-amber-400",
          )}
          data-storage={storage?.kind ?? "loading"}
        >
          <Database className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>
            {storage === null
              ? "Membuka penyimpanan perangkat…"
              : `Tersimpan di ${storage.location}.`}
            {storage?.kind === "localStorage" &&
              ` DB lokal tidak bisa dibuka di sini (${storage.notice ?? "mis. aplikasi terbuka di tab lain"}) — data tetap aman.`}
            {storage?.kind === "sqlite" && storage.notice && ` ${storage.notice}`}
            {storage?.error && ` Gagal menyimpan: ${storage.error}`}
          </span>
        </p>
        {storage?.lastPushedAt && (
          <p className="px-1 text-xs text-muted-foreground" data-last-pushed={storage.lastPushedAt}>
            Perubahan dari perangkat ini terakhir terkirim{" "}
            {pushedDate.format(new Date(storage.lastPushedAt))} pukul{" "}
            {time.format(new Date(storage.lastPushedAt))}.
          </p>
        )}
        <p className="px-1 text-xs text-muted-foreground">
          Foto struk disimpan terpisah dan tidak termasuk ukuran di atas.
        </p>
        <Link
          href="/backup"
          className="flex items-center gap-3 rounded-xl bg-background px-4 py-3 text-sm font-medium ring-1 ring-foreground/10 hover:bg-muted"
        >
          <FolderArchive className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1">Backup ke Google Drive</span>
          {backupFailed && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              Gagal
            </span>
          )}
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
        <ResetDeviceData
          pending={outbox.length}
          onReset={() => {
            if (resetDeviceData()) {
              setMessage("Data perangkat dimuat ulang dari server.");
              router.refresh();
            }
          }}
        />
      </section>
    </div>
  );
}
