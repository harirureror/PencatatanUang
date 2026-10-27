"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, KeyRound, LoaderCircle } from "lucide-react";

import { FieldError, FormError } from "@/components/auth/field-error";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordRules } from "@/components/auth/password-rules";
import { OnlineOnlyHint } from "@/components/local/online-only";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { validateChangePassword, type ChangePasswordErrors, type ChangePasswordField } from "@/lib/auth-rules";
import { changePassword } from "@/lib/auth-client";
import { useOnline } from "@/lib/local/replica-store";

const ORDER: ChangePasswordField[] = ["current", "password", "confirm"];
const EMPTY = { current: "", password: "", confirm: "" };

/** Ganti sandi: sandi saat ini + sandi baru. Perangkat lain dikeluarkan; perangkat ini tetap masuk. */
export function ChangePasswordForm({ account }: { account: string }) {
  const online = useOnline();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<ChangePasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ signedOut: number } | null>(null);
  const refs = {
    current: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };
  const { current: currentRef, password: passwordRef, confirm: confirmRef } = refs;
  const focus = (field: ChangePasswordField) =>
    ({ current: currentRef, password: passwordRef, confirm: confirmRef })[field].current?.focus();

  const set = (field: ChangePasswordField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setDone(null);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const found = validateChangePassword(values, account);
    setErrors(found);
    const first = ORDER.find((f) => found[f]);
    if (first) return focus(first);

    setPending(true);
    try {
      const result = await changePassword(values);
      if (result.ok) {
        setValues(EMPTY);
        setDone({ signedOut: result.signedOut });
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setFormError(result.error ?? null);
      const failed = ORDER.find((f) => result.fieldErrors?.[f]);
      if (failed) focus(failed);
    } catch {
      setFormError("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  const describedBy = (field: ChangePasswordField, extra?: string) =>
    [errors[field] ? `${field}-error` : null, extra].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {formError && (
        <FormError>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {formError}
        </FormError>
      )}
      {/* Bantu pengelola sandi menyimpan sandi baru untuk akun yang benar. */}
      <input type="text" name="username" autoComplete="username" value={account} readOnly hidden />

      <div className="flex flex-col gap-2">
        <Label htmlFor="current">Kata sandi saat ini</Label>
        <PasswordInput
          ref={currentRef}
          id="current"
          name="current"
          autoComplete="current-password"
          value={values.current}
          onChange={(e) => set("current", e.target.value)}
          aria-invalid={!!errors.current}
          aria-describedby={describedBy("current")}
        />
        <FieldError id="current-error" message={errors.current} />
        <Link href="/lupa-sandi" className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline">
          Lupa sandi saat ini?
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Kata sandi baru</Label>
        <PasswordInput
          ref={passwordRef}
          id="password"
          name="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => set("password", e.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby={describedBy("password", "password-rules")}
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
          aria-describedby={describedBy("confirm")}
        />
        <FieldError id="confirm-error" message={errors.confirm} />
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" className="h-12 text-base" disabled={pending || !online} aria-busy={pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
          {pending ? "Menyimpan…" : "Simpan kata sandi baru"}
        </Button>
        <OnlineOnlyHint action="Mengganti kata sandi" className="justify-center" />
        <p role="status" aria-live="polite" className="flex min-h-5 items-start justify-center gap-1.5 text-center text-sm text-emerald-700 dark:text-emerald-400">
          {done && (
            <>
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              {done.signedOut > 0
                ? `Kata sandi diganti. ${done.signedOut} perangkat lain diminta masuk ulang.`
                : "Kata sandi diganti."}
            </>
          )}
        </p>
      </div>
    </form>
  );
}
