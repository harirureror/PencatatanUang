import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowLeft,
  Banknote,
  FolderKanban,
  HardDriveDownload,
  RefreshCw,
  Tags,
  UserRound,
} from "lucide-react";

import { ResetDefaultsRow } from "@/components/pengaturan/reset-defaults-row";
import { SignOutRow } from "@/components/pengaturan/sign-out-row";
import { SettingsLinkRow, SettingsSection } from "@/components/pengaturan/settings-section";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { formatPhone } from "@/lib/auth-rules";
import { currencyName, NUMBER_FORMATS } from "@/lib/money-settings";
import { getMoneyDisplay, getMoneyFormat, getMoneyFormatter } from "@/server/money";
import { listCategories } from "@/server/categories";
import { getCurrentUserId } from "@/server/current-user";
import { getSessionUser } from "@/server/session";

export const metadata = { title: "Pengaturan · UangLapangan" };

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export default async function PengaturanPage() {
  await connection();
  const userId = await getCurrentUserId();
  const [user, categories, money] = await Promise.all([
    getSessionUser(),
    listCategories(userId),
    getMoneyFormat(),
  ]);
  const [display, formatMoney] = await Promise.all([getMoneyDisplay(), getMoneyFormatter()]);
  const expense = categories.filter((c) => c.type === "expense");
  const income = categories.filter((c) => c.type === "income");
  const custom = categories.filter((c) => !c.isDefault).length;
  const numberFormat = NUMBER_FORMATS.find((f) => f.locale === money.numberFormat);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Kembali ke dashboard"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Pengaturan</h1>
          <p className="text-sm text-muted-foreground">Profil, format uang, dan kategori</p>
        </div>
      </header>

      {/* 1. Profil pengguna */}
      <SettingsSection id="bagian-profil" title="Profil">
        <Link
          href="/pengaturan/profil"
          className="flex items-center gap-3 rounded-2xl px-4 py-4 hover:bg-muted/60"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
            {initials(user?.name ?? "")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{user?.name}</span>
            {user?.email && <span className="block truncate text-sm text-muted-foreground">{user.email}</span>}
            {user?.phone && <span className="block text-sm text-muted-foreground tabular-nums">{formatPhone(user.phone)}</span>}
            {!user?.email && !user?.phone && <span className="block text-sm text-muted-foreground">Belum ada kontak</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
            <UserRound className="size-4" aria-hidden />
            Ubah
          </span>
        </Link>
      </SettingsSection>

      {/* 2. Format uang */}
      <SettingsSection id="bagian-uang" title="Format uang">
        <SettingsLinkRow
          href="/pengaturan/format-uang"
          icon={Banknote}
          title={`${money.currency} · ${currencyName(money.currency)}`}
          description={
            numberFormat
              ? `${numberFormat.label} — Rp1.250.000 tampil ${formatMoney(1_250_000)}${display.rate === null ? " (kurs belum tersedia)" : ""}`
              : undefined
          }
        />
      </SettingsSection>

      {/* 3. Kategori */}
      <SettingsSection id="bagian-kategori" title="Kategori">
        <SettingsLinkRow
          href="/pengaturan/kategori"
          icon={Tags}
          title="Kategori pengeluaran"
          description={expense.slice(0, 4).map((c) => c.name).join(", ") + (expense.length > 4 ? ", …" : "")}
          value={expense.length}
        />
        <SettingsLinkRow
          href="/pengaturan/kategori?jenis=pemasukan"
          icon={Tags}
          title="Kategori pemasukan"
          description={income.map((c) => c.name).join(", ")}
          value={income.length}
        />
        {custom > 0 && (
          <p className="px-4 py-2.5 text-xs text-muted-foreground">{custom} kategori buatan sendiri.</p>
        )}
      </SettingsSection>

      <SettingsSection id="bagian-tampilan" title="Tampilan">
        <div className="p-3">
          <ThemeToggle />
        </div>
      </SettingsSection>

      <SettingsSection id="bagian-lain" title="Data & akun">
        <SettingsLinkRow href="/proyek" icon={FolderKanban} title="Kelola proyek" />
        <SettingsLinkRow href="/sinkron" icon={RefreshCw} title="Sinkronisasi" description="Data di perangkat & server" />
        <SettingsLinkRow href="/backup" icon={HardDriveDownload} title="Backup ke Google Drive" />
        <ResetDefaultsRow />
        <SignOutRow />
      </SettingsSection>
    </main>
  );
}
