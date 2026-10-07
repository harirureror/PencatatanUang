import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNextPath } from "@/lib/auth-rules";

export const metadata = { title: "Masuk · UangLapangan" };

export default async function MasukPage({ searchParams }: PageProps<"/masuk">) {
  const { next, akun } = await searchParams;
  const nextPath = safeNextPath(next);
  return (
    <AuthShell
      title="Masuk ke akun"
      description="Catatan kas proyekmu tersimpan aman di akun pribadi."
      footer={
        <>
          Belum punya akun?{" "}
          <Link
            href={nextPath === "/" ? "/daftar" : `/daftar?next=${encodeURIComponent(nextPath)}`}
            className="font-medium text-primary hover:underline"
          >
            Daftar
          </Link>
        </>
      }
    >
      <SignInForm next={nextPath} initialIdentifier={typeof akun === "string" ? akun.slice(0, 254) : ""} />
    </AuthShell>
  );
}
