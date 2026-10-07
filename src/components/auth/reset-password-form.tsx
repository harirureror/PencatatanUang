"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, KeyRound, LoaderCircle } from "lucide-react";

import { FieldError, FormError } from "@/components/auth/field-error";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordRules } from "@/components/auth/password-rules";
import { OnlineOnlyHint } from "@/components/local/online-only";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { validateNewPassword, type NewPasswordErrors } from "@/lib/auth-rules";
import { useOnline } from "@/lib/local/replica-store";
import { resetPassword } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/** Buat kata sandi baru dari tautan / kode atur ulang. Berhasil → ajak masuk dengan sandi baru. */
export function ResetPasswordForm({ token, account }: { token: string; account: string }) {
  const online = useOnline();
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<NewPasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const set = (field: "password" | "confirm", value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const found = validateNewPassword(values.password, values.confirm, account);
    setErrors(found);
    if (found.password) return passwordRef.current?.focus();
    if (found.confirm) return confirmRef.current?.focus();
    setPending(true);
    try {
      const result = await resetPassword(token, values.password, values.confirm);
      if (result.ok) return setDone(true);
      setErrors(result.fieldErrors ?? {});
      setFormError(result.error ?? null);
      setExpired(!!result.expired);
    } catch {
      setFormError("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          <CircleCheck className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Kata sandi diperbarui</p>
          <p className="text-sm text-muted-foreground">
            Masuk dengan sandi baru. Perangkat lain yang masih masuk akan diminta masuk ulang.
          </p>
        </div>
        <Link href={`/masuk?akun=${encodeURIComponent(account)}`} className={cn(buttonVariants(), "h-12 w-full text-base")}>
          Masuk sekarang
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Untuk akun <span className="font-medium text-foreground">{account}</span>
      </p>
      {formError && (
        <FormError>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {formError}
            {expired && (
              <>
                {" "}
                <Link href="/lupa-sandi" className="font-medium underline">
                  Minta tautan baru
                </Link>
              </>
            )}
          </span>
        </FormError>
      )}
      {/* Bantu pengelola sandi menyimpan sandi baru untuk akun yang benar. */}
      <input type="text" name="username" autoComplete="username" value={account} readOnly hidden />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Kata sandi baru</Label>
        <PasswordInput
          ref={passwordRef}
          id="password"
          name="password"
          autoComplete="new-password"
          autoFocus
          value={values.password}
          onChange={(e) => set("password", e.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby={[errors.password ? "password-error" : null, "password-rules"].filter(Boolean).join(" ")}
        />
        <PasswordRules id="password-rules" password={values.password} />
        <FieldError id="password-error" message={errors.password} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Ulangi kata sandi baru</Label>
        <PasswordInput
          ref={confirmRef}
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => set("confirm", e.target.value)}
          aria-invalid={!!errors.confirm}
          aria-describedby={errors.confirm ? "confirm-error" : undefined}
        />
        <FieldError id="confirm-error" message={errors.confirm} />
      </div>
      <div className="flex flex-col gap-2">
        <Button type="submit" className="h-12 text-base" disabled={pending || !online || expired} aria-busy={pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
          {pending ? "Menyimpan…" : "Simpan sandi baru"}
        </Button>
        <OnlineOnlyHint action="Menyimpan sandi baru" className="justify-center" />
      </div>
    </form>
  );
}
