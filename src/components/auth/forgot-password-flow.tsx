"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, Mail, MessageSquareText, Send } from "lucide-react";

import { FieldError, FormError } from "@/components/auth/field-error";
import { OnlineOnlyHint } from "@/components/local/online-only";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhone, parseIdentifier, RESET_CODE_LENGTH, validateSignIn } from "@/lib/auth-rules";
import { useOnline } from "@/lib/local/replica-store";
import { requestReset, verifyResetCode } from "@/lib/auth-client";

type Sent = { channel: "email" | "phone"; destination: string };

/** "demo@uanglapangan.id" → "d***o@uanglapangan.id", "+6281234567890" → "0812-****-7890". */
function maskDestination({ channel, destination }: Sent): string {
  if (channel === "phone") return formatPhone(destination).replace(/-(\d{4})-/, "-****-");
  const [user, domain] = destination.split("@");
  return `${user[0]}${"*".repeat(Math.max(1, Math.min(3, user.length - 2)))}${user.length > 1 ? user[user.length - 1] : ""}@${domain}`;
}

function useCountdown(): [number, (s: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

/**
 * Lupa sandi: minta tautan (email) atau kode (nomor HP), lalu — untuk nomor HP — masukkan
 * kode 6 digit sebelum lanjut ke halaman atur ulang sandi.
 */
export function ForgotPasswordFlow({ initialIdentifier = "" }: { initialIdentifier?: string }) {
  const router = useRouter();
  const online = useOnline();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [resendIn, setResendIn] = useCountdown();
  const identifierRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const kind = parseIdentifier(identifier)?.kind;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setFormError(null);
    const error = validateSignIn({ identifier, password: "x" }).identifier;
    setFieldError(error);
    if (error) return identifierRef.current?.focus();
    setBusy("send");
    try {
      const result = await requestReset(identifier);
      if (result.retryAfter) setResendIn(result.retryAfter);
      if (!result.ok) return setFormError(result.error);
      setSent({ channel: result.channel, destination: result.destination });
      setCode("");
      setCodeError(undefined);
    } catch {
      setFormError("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy || !sent) return;
    if (code.length !== RESET_CODE_LENGTH) {
      setCodeError(`Masukkan ${RESET_CODE_LENGTH} digit kode.`);
      return codeRef.current?.focus();
    }
    setBusy("verify");
    try {
      const result = await verifyResetCode(sent.destination, code);
      if (!result.ok) {
        setCodeError(result.error);
        return codeRef.current?.focus();
      }
      router.push(`/atur-ulang-sandi?token=${encodeURIComponent(result.token)}`);
    } catch {
      setCodeError("Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  const resend = (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <button
        type="button"
        onClick={() => {
          setSent(null);
          setFormError(null);
        }}
        className="font-medium text-primary hover:underline"
      >
        Ganti email / nomor
      </button>
      <button
        type="button"
        onClick={() => void send()}
        disabled={resendIn > 0 || busy !== null || !online}
        className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
      >
        {resendIn > 0 ? <span className="tabular-nums">Kirim ulang dalam {resendIn} dtk</span> : "Kirim ulang"}
      </button>
    </div>
  );

  if (sent?.channel === "email") {
    return (
      <div className="flex flex-col gap-5">
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="size-6" aria-hidden />
          </span>
          <p className="font-semibold">Cek email kamu</p>
          <p className="text-sm text-muted-foreground">
            Kalau <span className="font-medium text-foreground">{maskDestination(sent)}</span> terdaftar, kami
            kirim tautan untuk membuat sandi baru. Tautan berlaku 30 menit — cek juga folder Spam.
          </p>
        </div>
        {formError && (
          <FormError>
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </FormError>
        )}
        {resend}
        {process.env.NODE_ENV !== "production" && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Mode pengembangan — bila pengiriman email belum diatur, tautannya tercetak di log server.
          </p>
        )}
      </div>
    );
  }

  if (sent?.channel === "phone") {
    return (
      <form onSubmit={verify} noValidate className="flex flex-col gap-5">
        <div role="status" className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageSquareText className="size-6" aria-hidden />
          </span>
          <p className="font-semibold">Masukkan kode</p>
          <p className="text-sm text-muted-foreground">
            Kalau <span className="font-medium text-foreground">{maskDestination(sent)}</span> terdaftar, kami
            kirim kode {RESET_CODE_LENGTH} digit lewat WhatsApp. Kode berlaku 10 menit.
          </p>
        </div>
        {formError && (
          <FormError>
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </FormError>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Kode verifikasi</Label>
          <Input
            ref={codeRef}
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={RESET_CODE_LENGTH}
            placeholder={"•".repeat(RESET_CODE_LENGTH)}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, RESET_CODE_LENGTH));
              setCodeError(undefined);
            }}
            aria-invalid={!!codeError}
            aria-describedby={codeError ? "code-error" : undefined}
            className="h-12 text-center font-mono text-xl tracking-[0.5em]"
          />
          <FieldError id="code-error" message={codeError} />
        </div>
        <Button type="submit" className="h-12 text-base" disabled={busy !== null || !online} aria-busy={busy === "verify"}>
          {busy === "verify" && <LoaderCircle className="animate-spin" aria-hidden />}
          {busy === "verify" ? "Memeriksa…" : "Lanjut"}
        </Button>
        {resend}
        {process.env.NODE_ENV !== "production" && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Mode pengembangan — bila WhatsApp (Fonnte) belum diatur, kodenya tercetak di log server.
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-5">
      {formError && (
        <FormError>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {formError}
            {resendIn > 0 && <span className="block text-xs tabular-nums">Coba lagi dalam {resendIn} detik.</span>}
          </span>
        </FormError>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="identifier">Email atau nomor HP akun</Label>
        <Input
          ref={identifierRef}
          id="identifier"
          name="identifier"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          placeholder="nama@contoh.com / 0812…"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            setFieldError(undefined);
          }}
          aria-invalid={!!fieldError}
          aria-describedby={fieldError ? "identifier-error" : "identifier-hint"}
          className="h-11"
        />
        <FieldError id="identifier-error" message={fieldError} />
        {!fieldError && (
          <p id="identifier-hint" className="text-xs text-muted-foreground">
            Email → kami kirim tautan. Nomor HP → kami kirim kode lewat WhatsApp.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Button type="submit" className="h-12 text-base" disabled={busy !== null || !online} aria-busy={busy === "send"}>
          {busy === "send" ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {busy === "send" ? "Mengirim…" : kind === "phone" ? "Kirim kode" : kind === "email" ? "Kirim tautan" : "Kirim"}
        </Button>
        <OnlineOnlyHint action="Atur ulang sandi" className="justify-center" />
      </div>
    </form>
  );
}
