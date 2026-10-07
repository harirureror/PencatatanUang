"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, LogIn } from "lucide-react";

import { FieldError, FormError } from "@/components/auth/field-error";
import { PasswordInput } from "@/components/auth/password-input";
import { OnlineOnlyHint } from "@/components/local/online-only";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateSignIn, type SignInErrors, type SignInField } from "@/lib/auth-rules";
import { useOnline } from "@/lib/local/replica-store";
import { useSetSession } from "@/components/auth/use-session";
import { signIn } from "@/lib/auth-client";
import { claimLocalData } from "@/lib/local/account-scope";

/** Form masuk: email / nomor HP + kata sandi. Setelah berhasil, menuju `next`. */
export function SignInForm({ next, initialIdentifier = "" }: { next: string; initialIdentifier?: string }) {
  const router = useRouter();
  const setSession = useSetSession();
  const online = useOnline();
  const [values, setValues] = useState({ identifier: initialIdentifier, password: "" });
  const [errors, setErrors] = useState<SignInErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Hitung mundur saat dikunci sementara karena terlalu banyak percobaan.
  useEffect(() => {
    if (lockedFor <= 0) return;
    const t = setTimeout(() => setLockedFor((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [lockedFor]);

  const set = (field: SignInField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || lockedFor > 0) return;
    setFormError(null);
    const found = validateSignIn(values);
    setErrors(found);
    const first = (["identifier", "password"] as const).find((f) => found[f]);
    if (first) return (first === "identifier" ? identifierRef : passwordRef).current?.focus();

    setPending(true);
    try {
      const result = await signIn(values);
      if (result.ok) {
        // Data perangkat milik akun lain dihapus sebelum data akun ini dimuat.
        await claimLocalData(result.user.id);
        setSession(result.user);
        router.replace(next);
        router.refresh();
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setFormError(result.error ?? null);
      if (result.retryAfter) setLockedFor(result.retryAfter);
      setValues((v) => ({ ...v, password: "" }));
      passwordRef.current?.focus();
    } catch {
      setFormError("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  const describedBy = (field: SignInField) => (errors[field] ? `${field}-error` : undefined);
  const disabled = pending || !online || lockedFor > 0;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {formError && (
        <FormError>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {formError}
            {lockedFor > 0 && <span className="block text-xs tabular-nums">Coba lagi dalam {lockedFor} detik.</span>}
          </span>
        </FormError>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="identifier">Email atau nomor HP</Label>
        <Input
          ref={identifierRef}
          id="identifier"
          name="identifier"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={!initialIdentifier}
          placeholder="nama@contoh.com / 0812…"
          value={values.identifier}
          onChange={(e) => set("identifier", e.target.value)}
          aria-invalid={!!errors.identifier}
          aria-describedby={describedBy("identifier")}
          className="h-11"
        />
        <FieldError id="identifier-error" message={errors.identifier} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="password">Kata sandi</Label>
          <Link
            href={values.identifier.trim() ? `/lupa-sandi?akun=${encodeURIComponent(values.identifier.trim())}` : "/lupa-sandi"}
            className="text-sm font-medium text-primary hover:underline"
          >
            Lupa sandi?
          </Link>
        </div>
        <PasswordInput
          ref={passwordRef}
          id="password"
          name="password"
          autoComplete="current-password"
          autoFocus={!!initialIdentifier}
          value={values.password}
          onChange={(e) => set("password", e.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby={describedBy("password")}
        />
        <FieldError id="password-error" message={errors.password} />
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" className="h-12 text-base" disabled={disabled} aria-busy={pending}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <LogIn aria-hidden />}
          {pending ? "Memeriksa…" : "Masuk"}
        </Button>
        <OnlineOnlyHint action="Masuk" className="justify-center" />
      </div>

      {process.env.NODE_ENV !== "production" && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Mode pengembangan — akun demo dari seed:{" "}
          <span className="font-medium text-foreground">demo@uanglapangan.id</span> /{" "}
          <span className="font-medium text-foreground">0812 3456 7890</span>, sandi{" "}
          <span className="font-medium text-foreground">lapangan123</span>.
        </p>
      )}
    </form>
  );
}
