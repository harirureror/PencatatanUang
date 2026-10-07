import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { safeNextPath } from "@/lib/auth-rules";

export const metadata = { title: "Daftar · UangLapangan" };

export default async function DaftarPage({ searchParams }: PageProps<"/daftar">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next);
  return (
    <AuthShell
      title="Buat akun"
      description="Gratis. Catatan kas tiap proyek hanya bisa dilihat olehmu."
      footer={
        <>
          Sudah punya akun?{" "}
          <Link
            href={nextPath === "/" ? "/masuk" : `/masuk?next=${encodeURIComponent(nextPath)}`}
            className="font-medium text-primary hover:underline"
          >
            Masuk
          </Link>
        </>
      }
    >
      <SignUpForm next={nextPath} />
    </AuthShell>
  );
}
