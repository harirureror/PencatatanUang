"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, LoaderCircle, Lock } from "lucide-react";

import { FieldError, FormError } from "@/components/auth/field-error";
import { PasswordInput } from "@/components/auth/password-input";
import { OnlineOnlyHint } from "@/components/local/online-only";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  contactChanged,
  formatPhone,
  NAME_MAX,
  validateProfile,
  type ProfileErrors,
  type ProfileField,
  type ProfileInput,
} from "@/lib/auth-rules";
import { useOnline } from "@/lib/local/replica-store";
import { useSetSession } from "@/components/auth/use-session";
import { saveProfile } from "@/lib/auth-client";

const ORDER: ProfileField[] = ["name", "email", "phone", "password"];

export type ProfileValues = { name: string; email: string | null; phone: string | null };

/** Ubah nama & kontak. Mengganti email / nomor HP (dipakai untuk masuk) butuh sandi saat ini. */
export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const online = useOnline();
  const router = useRouter();
  const setSession = useSetSession();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState<ProfileInput>({
    name: initial.name,
    email: initial.email ?? "",
    phone: initial.phone ? formatPhone(initial.phone) : "",
    password: "",
  });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };
  const { name: nameRef, email: emailRef, phone: phoneRef, password: passwordRef } = refs;

  const needsPassword = contactChanged(values, saved);
  const dirty =
    values.name.trim() !== saved.name || needsPassword;

  const set = (field: ProfileField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
    setDone(false);
  };
  const focus = (field: ProfileField) =>
    ({ name: nameRef, email: emailRef, phone: phoneRef, password: passwordRef })[field].current?.focus();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found = validateProfile(values, saved);
    setErrors(found);
    const first = ORDER.find((f) => found[f]);
    if (first) return focus(first);
    if (found.form) return emailRef.current?.focus();

    setPending(true);
    try {
      const result = await saveProfile(values);
      if (!result.ok) {
        setErrors({ ...result.fieldErrors, form: result.error });
        const failed = ORDER.find((f) => result.fieldErrors?.[f]);
        if (failed) focus(failed);
        return;
      }
      // Data akun dari server (email huruf kecil, nomor +62…).
      const { user } = result;
      setSaved({ name: user.name, email: user.email, phone: user.phone });
      setValues({ name: user.name, email: user.email ?? "", phone: user.phone ? formatPhone(user.phone) : "", password: "" });
      setDone(true);
      setSession(user);
      router.refresh();
    } catch {
      setErrors({ form: "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi." });
    } finally {
      setPending(false);
    }
  }

  const describedBy = (field: ProfileField, extra?: string) =>
    [errors[field] ? `${field}-error` : null, extra].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {errors.form && (
        <FormError>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {errors.form}
        </FormError>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nama</Label>
        <Input
          ref={nameRef}
          id="name"
          name="name"
          autoComplete="name"
          maxLength={NAME_MAX}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          aria-invalid={!!errors.name}
          aria-describedby={describedBy("name", "name-hint")}
          className="h-11"
        />
        <FieldError id="name-error" message={errors.name} />
        <p id="name-hint" className="text-xs text-muted-foreground">
          Nama yang tampil di menu akun dan di email dari UangLapangan.
        </p>
      </div>

      <fieldset className="flex flex-col gap-4 rounded-2xl p-4 ring-1 ring-foreground/10">
        <legend className="px-1 text-sm font-medium">Kontak untuk masuk</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nama@contoh.com"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={describedBy("email")}
            className="h-11"
          />
          <FieldError id="email-error" message={errors.email} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Nomor HP</Label>
          <Input
            ref={phoneRef}
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0812 3456 7890"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            aria-invalid={!!errors.phone}
            aria-describedby={describedBy("phone")}
            className="h-11"
          />
          <FieldError id="phone-error" message={errors.phone} />
        </div>
        <p className="text-xs text-muted-foreground">
          Isi minimal salah satu. Keduanya bisa dipakai untuk masuk dan memulihkan sandi.
        </p>

        {needsPassword && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <Label htmlFor="password" className="flex items-center gap-1.5">
              <Lock className="size-3.5" aria-hidden />
              Sandi saat ini
            </Label>
            <PasswordInput
              ref={passwordRef}
              id="password"
              name="password"
              autoComplete="current-password"
              value={values.password}
              onChange={(e) => set("password", e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={describedBy("password", "password-hint")}
            />
            <FieldError id="password-error" message={errors.password} />
            <p id="password-hint" className="text-xs text-muted-foreground">
              Untuk keamanan, mengganti email / nomor HP perlu konfirmasi sandi.
            </p>
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Button type="submit" className="h-12 text-base" disabled={pending || !dirty || !online} aria-busy={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden />}
          {pending ? "Menyimpan…" : "Simpan profil"}
        </Button>
        <OnlineOnlyHint action="Menyimpan profil" className="justify-center" />
        <p role="status" aria-live="polite" className="flex min-h-5 items-center justify-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
          {done && !dirty && (
            <>
              <CircleCheck className="size-4" aria-hidden />
              Profil disimpan.
            </>
          )}
        </p>
      </div>
    </form>
  );
}
