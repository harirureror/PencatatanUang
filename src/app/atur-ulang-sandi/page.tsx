import Link from "next/link";
import { LinkIcon } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { buttonVariants } from "@/components/ui/button";
import { checkResetToken } from "@/server/password-reset";
import { cn } from "@/lib/utils";

export const metadata = { title: "Atur ulang sandi · UangLapangan" };

export default async function AturUlangSandiPage({ searchParams }: PageProps<"/atur-ulang-sandi">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : undefined;
  const status = await checkResetToken(value);

  if (!status.valid) {
    return (
      <AuthShell
        title={status.reason === "expired" ? "Tautan sudah kedaluwarsa" : "Tautan tidak berlaku"}
        description={
          status.reason === "expired"
            ? "Demi keamanan, tautan atur ulang sandi hanya berlaku 30 menit dan sekali pakai."
            : "Tautan ini salah, sudah dipakai, atau terpotong saat disalin."
        }
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <LinkIcon className="size-6" aria-hidden />
          </span>
          <Link href="/lupa-sandi" className={cn(buttonVariants(), "h-12 w-full text-base")}>
            Minta tautan baru
          </Link>
          <Link href="/masuk" className="text-sm font-medium text-primary hover:underline">
            Kembali masuk
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Buat kata sandi baru" description="Buat sandi yang mudah kamu ingat tapi sulit ditebak orang lain.">
      <ResetPasswordForm token={value!} account={status.account} />
    </AuthShell>
  );
}
