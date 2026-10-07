import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordFlow } from "@/components/auth/forgot-password-flow";

export const metadata = { title: "Lupa sandi · UangLapangan" };

export default async function LupaSandiPage({ searchParams }: PageProps<"/lupa-sandi">) {
  const { akun } = await searchParams;
  return (
    <AuthShell
      title="Lupa kata sandi?"
      description="Tenang, catatan kasmu tetap aman. Kami bantu buat sandi baru."
      footer={
        <>
          Sudah ingat?{" "}
          <Link href="/masuk" className="font-medium text-primary hover:underline">
            Kembali masuk
          </Link>
        </>
      }
    >
      <ForgotPasswordFlow initialIdentifier={typeof akun === "string" ? akun.slice(0, 254) : ""} />
    </AuthShell>
  );
}
