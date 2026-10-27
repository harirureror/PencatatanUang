"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck, Copy, KeyRound, LoaderCircle, Shuffle } from "lucide-react";

import { FieldError, FormError } from "@/components/auth/field-error";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordRules } from "@/components/auth/password-rules";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { validateNewPassword, type NewPasswordErrors } from "@/lib/auth-rules";
import { useOnline } from "@/lib/local/replica-store";

// Tanpa huruf/angka yang mirip (0/O, 1/l/I) supaya mudah didiktekan.
const LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

/** Sandi sementara acak 10 karakter (selalu ada huruf & angka). */
function randomPassword(): string {
  const pool = LETTERS + DIGITS;
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  const chars = [...bytes].map((b) => pool[b % pool.length]);
  chars[bytes[0] % 8 + 1] = DIGITS[bytes[1] % DIGITS.length];
  chars[0] = LETTERS[bytes[2] % LETTERS.length];
  return chars.join("");
}

/** Tombol "Atur sandi" + dialog untuk admin mengganti sandi satu akun pengguna. */
export function AdminSetPassword({ userId, account, name }: { userId: string; account: string; name: string }) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<NewPasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ password: string; signedOut: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setValues({ password: "", confirm: "" });
    setErrors({});
    setFormError(null);
    setDone(null);
    setCopied(false);
  };
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
    if (Object.keys(found).length > 0) return;
    setPending(true);
    try {
      const res = await fetch(`/api/admin/pengguna/${encodeURIComponent(userId)}/sandi`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
        credentials: "same-origin",
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: { signedOut: number };
        error?: string;
        fieldErrors?: NewPasswordErrors;
      };
      if (res.ok && body.data) return setDone({ password: values.password, signedOut: body.data.signedOut });
      setErrors(body.fieldErrors ?? {});
      setFormError(body.error ?? (body.fieldErrors ? null : `Gagal menyimpan (HTTP ${res.status}).`));
    } catch {
      setFormError("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(done.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" className="h-9 shrink-0" aria-label={`Atur sandi ${name}`} />}
      >
        <KeyRound aria-hidden />
        Atur sandi
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atur sandi baru</DialogTitle>
          <DialogDescription>
            Untuk <span className="font-medium text-foreground">{name}</span> ({account}). Tanpa verifikasi email / nomor
            HP — pastikan ini memang permintaan pemilik akun.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div role="status" className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Sandi diganti.{" "}
              {done.signedOut > 0 ? `${done.signedOut} sesi akun ini dikeluarkan.` : "Akun ini sedang tidak masuk di mana pun."}
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-base">{done.password}</code>
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                <Copy aria-hidden />
                {copied ? "Tersalin" : "Salin"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Berikan sandi ini langsung ke pemilik akun (jangan di grup), lalu minta ia menggantinya lewat Pengaturan →
              Ganti kata sandi setelah masuk.
            </p>
            <Button type="button" className="h-10" onClick={() => setOpen(false)}>
              Selesai
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {formError && (
              <FormError>
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {formError}
              </FormError>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`admin-pw-${userId}`}>Sandi baru</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-primary"
                  onClick={() => {
                    const pw = randomPassword();
                    setValues({ password: pw, confirm: pw });
                    setErrors({});
                  }}
                >
                  <Shuffle aria-hidden />
                  Buat acak
                </Button>
              </div>
              <PasswordInput
                id={`admin-pw-${userId}`}
                autoComplete="new-password"
                value={values.password}
                onChange={(e) => set("password", e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={`admin-pw-rules-${userId}`}
              />
              <PasswordRules id={`admin-pw-rules-${userId}`} password={values.password} />
              <FieldError id={`admin-pw-error-${userId}`} message={errors.password} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`admin-confirm-${userId}`}>Ulangi sandi baru</Label>
              <PasswordInput
                id={`admin-confirm-${userId}`}
                autoComplete="new-password"
                value={values.confirm}
                onChange={(e) => set("confirm", e.target.value)}
                aria-invalid={!!errors.confirm}
              />
              <FieldError id={`admin-confirm-error-${userId}`} message={errors.confirm} />
            </div>
            <Button type="submit" className="h-11" disabled={pending || !online} aria-busy={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
              {pending ? "Menyimpan…" : "Simpan & keluarkan akun ini"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
