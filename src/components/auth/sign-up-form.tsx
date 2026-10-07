"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, UserPlus } from "lucide-react";

import { FieldError, FormError } from "@/components/auth/field-error";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordRules } from "@/components/auth/password-rules";
import { OnlineOnlyHint } from "@/components/local/online-only";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NAME_MAX,
  validateSignUp,
  type SignUpErrors,
  type SignUpField,
  type SignUpInput,
} from "@/lib/auth-rules";
import { useOnline } from "@/lib/local/replica-store";
import { useSetSession } from "@/components/auth/use-session";
import { signUp } from "@/lib/auth-client";
import { claimLocalData } from "@/lib/local/account-scope";

const ORDER: SignUpField[] = ["name", "identifier", "password", "confirm"];

/** Form daftar akun: nama, email / nomor HP, kata sandi + ulangi. Berhasil → langsung masuk. */
export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const setSession = useSetSession();
  const online = useOnline();
  const [values, setValues] = useState<SignUpInput>({ name: "", identifier: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [taken, setTaken] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const refs = { name: nameRef, identifier: identifierRef, password: passwordRef, confirm: confirmRef };

  const set = (field: SignUpField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    if (field === "identifier") setTaken(false);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const found = validateSignUp(values);
    setErrors(found);
    const first = ORDER.find((f) => found[f]);
    if (first) return refs[first].current?.focus();

    setPending(true);
    try {
      const result = await signUp(values);
      if (result.ok) {
        await claimLocalData(result.user.id);
        setSession(result.user);
        router.replace(next);
        router.refresh();
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setTaken(!!result.taken);
      setFormError(result.error ?? null);
      const failed = ORDER.find((f) => result.fieldErrors?.[f]);
      if (failed) refs[failed].current?.focus();
    } catch {
      setFormError("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  const describedBy = (field: SignUpField, extra?: string) =>
    [errors[field] ? `${field}-error` : null, extra].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {formError && (
        <FormError>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {formError}
        </FormError>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nama</Label>
        <Input
          ref={nameRef}
          id="name"
          name="name"
          autoComplete="name"
          autoFocus
          maxLength={NAME_MAX}
          placeholder="Mis. Raka Pratama"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy("name")}
          className="h-11"
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="identifier">Email atau nomor HP</Label>
        <Input
          ref={identifierRef}
          id="identifier"
          name="identifier"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nama@contoh.com / 0812…"
          value={values.identifier}
          onChange={(e) => set("identifier", e.target.value)}
          aria-invalid={!!errors.identifier}
          aria-describedby={describedBy("identifier", "identifier-hint")}
          className="h-11"
        />
        <FieldError id="identifier-error" message={errors.identifier}>
          {taken && (
            <>
              {" "}
              <Link
                href={`/masuk?akun=${encodeURIComponent(values.identifier.trim())}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Masuk saja
              </Link>
            </>
          )}
        </FieldError>
        <p id="identifier-hint" className="text-xs text-muted-foreground">
          Dipakai untuk masuk dan memulihkan sandi.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Kata sandi</Label>
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
        <Label htmlFor="confirm">Ulangi kata sandi</Label>
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
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
          {pending ? "Membuat akun…" : "Daftar"}
        </Button>
        <OnlineOnlyHint action="Daftar akun" className="justify-center" />
      </div>
    </form>
  );
}
