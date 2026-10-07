import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";

import { ProfileForm } from "@/components/pengaturan/profile-form";
import { getSessionUser } from "@/server/session";

export const metadata = { title: "Profil · UangLapangan" };

export default async function ProfilPage() {
  await connection();
  const user = await getSessionUser();
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
          <h1 className="text-lg font-semibold">Profil</h1>
          <p className="text-sm text-muted-foreground">Nama dan kontak akunmu</p>
        </div>
      </header>
      {user && <ProfileForm initial={{ name: user.name, email: user.email, phone: user.phone }} />}
    </main>
  );
}
