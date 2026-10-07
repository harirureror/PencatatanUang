"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";

import {
  createTransaction,
  updateTransaction,
  type TransactionFormState,
} from "@/app/catat/actions";
import { ConvertedHint } from "@/components/money/money-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReceiptPicker, type PickedPhoto } from "@/components/struk/receipt-picker";
import { CategoryPicker } from "@/components/transaksi/category-picker";
import { DatePicker } from "@/components/transaksi/date-picker";
import { formatDigits } from "@/lib/format";
import { formatFileSize, MAX_UPLOAD_BYTES } from "@/lib/image";
import { queueCreate, queueUpdate, useOnline } from "@/lib/local/replica-store";
import { setBackGuard } from "@/lib/native/back-guard";
import type { ReturnPath } from "@/lib/return-path";
import { checkTransactionFields, mergeTransactionChanges } from "@/lib/transaction-rules";
import type { Category, Transaction, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

type TransactionFormProps = {
  type: TransactionType;
  categories: Category[];
  /** Hari ini (YYYY-MM-DD) — nilai awal tanggal dan batas atasnya. */
  today: string;
  /** Halaman tujuan setelah berhasil disimpan. */
  returnTo: ReturnPath;
  /** Diisi saat mengubah catatan yang sudah ada. */
  initial?: Transaction;
  /** Jumlah foto bukti yang sudah tersimpan (form ubah). */
  existingReceiptCount?: number;
  /** Status "tanpa struk" saat ini (form ubah). */
  initialNoReceipt?: boolean;
};

const COPY: Record<TransactionType, { category: string; placeholder: string; submit: string }> = {
  expense: {
    category: "Kategori",
    placeholder: "Mis. bensin mobil ke lokasi",
    submit: "Simpan pengeluaran",
  },
  income: {
    category: "Sumber dana",
    placeholder: "Mis. transfer tambahan dari kantor",
    submit: "Simpan pemasukan",
  },
};

const initialState: TransactionFormState = {};

export function TransactionForm({
  type,
  categories,
  today,
  returnTo,
  initial,
  existingReceiptCount = 0,
  initialNoReceipt = false,
}: TransactionFormProps) {
  const copy = COPY[type];
  const [state, formAction, pending] = useActionState(
    initial ? updateTransaction : createTransaction,
    initialState,
  );
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [date, setDate] = useState(initial?.transactionDate ?? today);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [noReceipt, setNoReceipt] = useState(initialNoReceipt);
  // Status "tanpa struk" hanya berlaku selama belum ada satu pun foto bukti.
  const hasPhotos = existingReceiptCount + photos.length > 0;

  const router = useRouter();
  const online = useOnline();
  const [offlineErrors, setOfflineErrors] = useState<TransactionFormState["errors"]>(undefined);
  const [savedOffline, setSavedOffline] = useState(false);

  /** Simpan di perangkat saat offline; dikirim ke server otomatis begitu online. */
  function saveOffline(formData: FormData) {
    if (photos.length > 0) {
      setPhotoError(
        "Sedang offline — foto struk baru bisa diunggah saat ada sinyal. Hapus fotonya dulu, atau simpan nanti.",
      );
      return;
    }
    const raw = Object.fromEntries(formData);
    const fields = initial ? mergeTransactionChanges(initial, raw) : raw;
    const category = categories.find((c) => c.id === fields.categoryId) ?? null;
    const result = checkTransactionFields(type, fields, category, today);
    setEdited([]);
    if ("errors" in result) {
      setOfflineErrors(result.errors);
      return;
    }
    if (initial) {
      queueUpdate(initial.id, initial.type, result.data);
    } else if (!queueCreate(type, result.data, { noReceipt })) {
      setOfflineErrors({
        form: "Data proyek aktif belum tersimpan di perangkat. Buka aplikasi sekali saat online dulu.",
      });
      return;
    }
    // Offline tidak bisa memuat halaman baru dari server; kembali ke halaman sebelumnya
    // (tersimpan di cache router) yang langsung membaca data perangkat.
    if (window.history.length > 1) router.back();
    else setSavedOffline(true);
  }

  // Isian yang belum disimpan jangan hilang karena tombol back Android / tutup tab.
  const dirty =
    amount !== (initial ? String(initial.amount) : "") ||
    categoryId !== (initial?.categoryId ?? "") ||
    date !== (initial?.transactionDate ?? today) ||
    description !== (initial?.description ?? "") ||
    photos.length > 0 ||
    noReceipt !== initialNoReceipt;
  const guarded = dirty && !pending && !savedOffline;
  useEffect(() => {
    if (!guarded) return;
    const removeGuard = setBackGuard(() =>
      window.confirm(initial ? "Buang perubahan yang belum disimpan?" : "Buang catatan yang belum disimpan?"),
    );
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      removeGuard();
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [guarded, initial]);

  // Foto bukti tidak ada di elemen form — sisipkan ke FormData saat dikirim.
  function submit(formData: FormData) {
    if (!navigator.onLine) {
      saveOffline(formData);
      return;
    }
    setOfflineErrors(undefined);
    const total = photos.reduce((sum, p) => sum + p.file.size, 0);
    if (total > MAX_UPLOAD_BYTES) {
      setPhotoError(
        `Total foto ${formatFileSize(total)} — maksimal ${formatFileSize(MAX_UPLOAD_BYTES)} sekali simpan. Hapus beberapa foto dulu.`,
      );
      return;
    }
    setPhotoError(null);
    for (const p of photos) formData.append("receipts", p.file, p.file.name);
    formAction(formData);
  }

  // Pesan error suatu kolom hilang begitu kolom itu diubah; di-reset tiap kali form dikirim.
  const [lastState, setLastState] = useState(state);
  const [edited, setEdited] = useState<string[]>([]);
  if (state !== lastState) {
    setLastState(state);
    setEdited([]);
  }
  const markEdited = (field: string) =>
    setEdited((prev) => (prev.includes(field) ? prev : [...prev, field]));
  const errors = Object.fromEntries(
    Object.entries(offlineErrors ?? state.errors ?? {}).filter(([field]) => !edited.includes(field)),
  ) as NonNullable<TransactionFormState["errors"]>;

  return (
    <form action={submit} className="flex flex-1 flex-col gap-5">
      {!online && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800"
        >
          <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Sedang offline — catatan disimpan di perangkat dan dikirim otomatis saat ada sinyal.
          Foto struk bisa ditambahkan nanti.
        </p>
      )}
      {savedOffline && (
        <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          Tersimpan di perangkat. Akan dikirim ke server begitu ada sinyal.
        </p>
      )}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Jumlah</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg font-medium text-muted-foreground">
            {type === "income" ? "+Rp" : "Rp"}
          </span>
          <Input
            id="amount"
            name="amount"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            autoFocus={!initial}
            placeholder="0"
            value={formatDigits(amount)}
            onChange={(e) => {
              setAmount(e.target.value.replace(/\D/g, "").slice(0, 12));
              markEdited("amount");
            }}
            aria-invalid={!!errors.amount}
            aria-describedby={errors.amount ? "amount-error" : "amount-converted"}
            className={cn(
              "h-14 text-2xl font-semibold tabular-nums md:text-2xl",
              type === "income" ? "pl-14 text-emerald-700 dark:text-emerald-400" : "pl-11",
            )}
          />
        </div>
        {errors.amount && (
          <p id="amount-error" className="text-sm text-destructive">
            {errors.amount}
          </p>
        )}
        <ConvertedHint id="amount-converted" amount={Number(amount || 0)} />
      </div>

      <CategoryPicker
        categories={categories}
        value={categoryId}
        onChange={(id) => {
          setCategoryId(id);
          markEdited("categoryId");
        }}
        type={type}
        label={copy.category}
        error={errors.categoryId}
      />

      <DatePicker
        value={date}
        today={today}
        onChange={(d) => {
          setDate(d);
          markEdited("transactionDate");
        }}
        error={errors.transactionDate}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">
          Keterangan <span className="font-normal text-muted-foreground">(opsional)</span>
        </Label>
        <Textarea
          id="description"
          name="description"
          maxLength={200}
          rows={2}
          enterKeyHint="done"
          placeholder={copy.placeholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <section aria-labelledby="bukti-struk" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="bukti-struk" className="text-sm font-medium">
            Bukti struk <span className="font-normal text-muted-foreground">(opsional)</span>
          </h2>
          {existingReceiptCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {existingReceiptCount} foto tersimpan
            </span>
          )}
        </div>
        <ReceiptPicker
          photos={photos}
          onChange={(next) => {
            setPhotos(next);
            setPhotoError(null);
            if (next.length > 0) setNoReceipt(false); // tanda hilang begitu foto ditambahkan
            markEdited("receipts");
          }}
          existingCount={existingReceiptCount}
        />
        {!hasPhotos && (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
              noReceipt
                ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
                : "border-input hover:bg-muted",
            )}
          >
            <input
              type="checkbox"
              name="noReceipt"
              checked={noReceipt}
              onChange={(e) => setNoReceipt(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-amber-600"
            />
            <span>
              <span className="font-medium">Tandai tanpa struk</span>
              <span className="block text-xs text-muted-foreground">
                Nota hilang atau tidak diberi. Tanda ini hilang otomatis saat foto ditambahkan.
              </span>
            </span>
          </label>
        )}
        {(photoError ?? errors.receipts) && (
          <p role="alert" className="text-sm text-destructive">
            {photoError ?? errors.receipts}
          </p>
        )}
      </section>

      {errors.form && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{errors.form}</p>
      )}

      {/* Tombol simpan menempel di bawah layar — tetap terjangkau jempol saat form panjang
          atau keyboard HP terbuka, dan tidak tertutup bilah navigasi gestur. */}
      <div className="sticky bottom-0 -mx-4 mt-auto bg-muted/80 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-muted/60">
        <Button
          type="submit"
          disabled={pending}
          className={cn(
            "h-12 w-full text-base",
            type === "income" && "bg-emerald-600 text-white hover:bg-emerald-600/85",
          )}
        >
          {pending ? "Menyimpan…" : initial ? "Simpan perubahan" : copy.submit}
        </Button>
      </div>
    </form>
  );
}
