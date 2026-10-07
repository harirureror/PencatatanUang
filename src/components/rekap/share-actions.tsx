"use client";

import { useEffect, useState } from "react";
import { Copy, FileDown, FileSpreadsheet, Printer, Share2 } from "lucide-react";

import { useFormatMoney } from "@/components/money/money-provider";
import { Button } from "@/components/ui/button";
import type { RekapData } from "@/lib/rekap";
import { buildRekapCsv, buildRekapText, rekapFileName } from "@/lib/rekap-export";

async function isNative(): Promise<boolean> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const bytesBase64 = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/** Unduh file di browser, atau di Android: tulis ke cache lalu buka menu bagikan file. */
async function saveFile(name: string, blob: Blob, title: string, dialogTitle: string): Promise<boolean> {
  if (await isNative()) {
    // WebView Android tidak bisa mengunduh blob → tulis ke cache lalu bagikan sebagai file.
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const data = bytesBase64(new Uint8Array(await blob.arrayBuffer()));
    const { uri } = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ title, files: [uri], dialogTitle });
    return false;
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Nama file dari header Content-Disposition (cadangan: `fallback`). */
const dispositionName = (res: Response, fallback: string) =>
  /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;

/**
 * Bagikan rekap ke atasan / tim: teks (menu bagikan HP / aplikasi Android, cadangan: salin),
 * salin teks, laporan Excel (dengan foto nota), unduh CSV, dan cetak / simpan PDF (browser).
 */
export function ShareActions({ data }: { data: RekapData }) {
  const formatMoney = useFormatMoney();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [native, setNative] = useState(false);
  useEffect(() => {
    void isNative().then(setNative);
  }, []);
  const title = `Rekap ${data.project.name}`;

  async function share() {
    const text = buildRekapText(data, formatMoney);
    try {
      if (await isNative()) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title, text, dialogTitle: "Bagikan rekap" });
        return setMessage(null);
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text });
        return setMessage(null);
      }
    } catch (error) {
      if (error instanceof Error && /abort|cancel/i.test(error.name + error.message)) return; // dibatalkan pengguna
    }
    setMessage((await copyText(text)) ? "Teks rekap disalin — tempel di WhatsApp atau email." : "Tidak bisa membagikan dari browser ini.");
  }

  async function copy() {
    setMessage((await copyText(buildRekapText(data, formatMoney))) ? "Teks rekap disalin." : "Tidak bisa menyalin otomatis dari browser ini.");
  }

  async function downloadCsv() {
    const csv = buildRekapCsv(data);
    const name = rekapFileName(data, "csv");
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const saved = await saveFile(name, blob, title, "Simpan / kirim CSV rekap");
      setMessage(saved ? `File ${name} diunduh.` : null);
    } catch (error) {
      if (error instanceof Error && /cancel/i.test(error.message)) return;
      setMessage("Gagal membuat file CSV.");
    }
  }

  async function downloadExcel() {
    const { kind, start, end } = data.period;
    const query = new URLSearchParams({ format: "xlsx", periode: kind, proyek: data.project.id });
    if (kind === "rentang") {
      query.set("dari", start);
      query.set("sampai", end);
    } else {
      query.set("tanggal", start);
    }
    setBusy(true);
    setMessage("Menyiapkan laporan Excel beserta foto nota…");
    try {
      const res = await fetch(`/api/rekap/ekspor?${query}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return setMessage(body?.error ?? "Gagal membuat laporan Excel.");
      }
      const name = dispositionName(res, rekapFileName(data, "xlsx"));
      const saved = await saveFile(name, await res.blob(), title, "Simpan / kirim laporan Excel");
      setMessage(saved ? `File ${name} diunduh.` : null);
    } catch (error) {
      if (error instanceof Error && /cancel/i.test(error.message)) return setMessage(null);
      setMessage("Gagal mengunduh laporan Excel — periksa koneksi internet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Bagikan rekap" className="flex flex-col gap-2 print:hidden">
      <div className="grid grid-cols-2 gap-2">
        <Button className="col-span-2 h-12 text-base" onClick={() => void share()}>
          <Share2 aria-hidden />
          Bagikan rekap
        </Button>
        <Button
          variant="outline"
          className="col-span-2 h-11"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void downloadExcel()}
        >
          <FileDown aria-hidden />
          {busy ? "Menyiapkan Excel…" : "Unduh laporan Excel + foto nota"}
        </Button>
        <Button variant="outline" className="h-11" onClick={() => void copy()}>
          <Copy aria-hidden />
          Salin teks
        </Button>
        <Button variant="outline" className="h-11" onClick={() => void downloadCsv()}>
          <FileSpreadsheet aria-hidden />
          Unduh CSV
        </Button>
        {!native && (
          <Button variant="outline" className="col-span-2 h-11" onClick={() => window.print()}>
            <Printer aria-hidden />
            Cetak / simpan PDF
          </Button>
        )}
      </div>
      <p role="status" aria-live="polite" className="min-h-4 text-center text-xs text-muted-foreground">
        {message}
      </p>
    </section>
  );
}

/** Saat mencetak: buka semua rincian (konten <details> tertutup tidak ikut tercetak). */
export function PrintExpander() {
  useEffect(() => {
    const opened: HTMLDetailsElement[] = [];
    const before = () => {
      document.querySelectorAll("details:not([open])").forEach((d) => {
        (d as HTMLDetailsElement).open = true;
        opened.push(d as HTMLDetailsElement);
      });
    };
    const after = () => {
      opened.splice(0).forEach((d) => (d.open = false));
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return null;
}
