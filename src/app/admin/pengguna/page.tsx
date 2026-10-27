import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Search } from "lucide-react";

import { AdminSetPassword } from "@/components/admin/admin-set-password";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/lib/auth-rules";
import { ADMIN_USER_LIMIT, isAdmin, listUsers } from "@/server/admin";
import { getSessionUser } from "@/server/session";

export const metadata = { title: "Kelola pengguna · UangLapangan" };

const dateTime = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

export default async function AdminPenggunaPage(props: PageProps<"/admin/pengguna">) {
  await connection();
  const me = await getSessionUser();
  // Bukan admin: halaman ini dianggap tidak ada.
  if (!isAdmin(me)) notFound();
  const q = (await props.searchParams).q;
  const query = typeof q === "string" ? q : "";
  const users = await listUsers(query);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <Link
          href="/pengaturan"
          aria-label="Kembali ke Pengaturan"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Kelola pengguna</h1>
          <p className="text-sm text-muted-foreground">Admin · atur ulang sandi tanpa verifikasi</p>
        </div>
      </header>

      <form role="search" className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Cari nama, email, atau nomor HP"
          aria-label="Cari pengguna"
          className="h-11 pl-9"
        />
      </form>

      <p className="text-sm text-muted-foreground">
        {users.length === 0
          ? "Tidak ada akun yang cocok."
          : `${users.length}${users.length === ADMIN_USER_LIMIT ? "+" : ""} akun${query ? ` cocok dengan "${query}"` : ""}.`}
      </p>

      <ul className="flex flex-col divide-y rounded-2xl bg-background ring-1 ring-foreground/10">
        {users.map((u) => {
          const account = u.email ?? (u.phone ? formatPhone(u.phone) : "—");
          return (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {u.name}
                  {u.id === me!.id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(kamu)</span>}
                </p>
                {u.email && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
                {u.phone && <p className="text-xs text-muted-foreground tabular-nums">{formatPhone(u.phone)}</p>}
                <p className="text-[11px] text-muted-foreground">
                  {u.lastActiveAt
                    ? `Aktif ${dateTime.format(new Date(u.lastActiveAt))} · ${u.activeSessions} perangkat`
                    : `Daftar ${dateTime.format(new Date(u.createdAt))} · tidak sedang masuk`}
                </p>
              </div>
              {u.id === me!.id ? (
                <Link href="/pengaturan/sandi" className="shrink-0 text-sm font-medium text-primary hover:underline">
                  Ganti sandi
                </Link>
              ) : (
                <AdminSetPassword userId={u.id} account={account} name={u.name} />
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
