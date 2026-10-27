import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";

import { ChangePasswordForm } from "@/components/pengaturan/change-password-form";
import { formatPhone } from "@/lib/auth-rules";
import { getSessionUser } from "@/server/session";

export const metadata = { title: "Ganti kata sandi · UangLapangan" };

export default async function GantiSandiPage() {
  await connection();
  const user = await getSessionUser();
  const account = user?.email ?? (user?.phone ? formatPhone(user.phone) : "");
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
          <h1 className="text-lg font-semibold">Ganti kata sandi</h1>
          <p className="truncate text-sm text-muted-foreground">{account || "Akunmu"}</p>
        </div>
      </header>
      {user && <ChangePasswordForm account={account} />}
    </main>
  );
}
