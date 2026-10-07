"use client";

import { useActionState, useState } from "react";

import { createProject, type ProjectFormState } from "@/app/proyek/baru/actions";
import { ConvertedHint } from "@/components/money/money-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnlineOnlyHint } from "@/components/local/online-only";
import { formatDigits } from "@/lib/format";
import { useOnline } from "@/lib/local/replica-store";
import type { ProjectField } from "@/server/project-input";

const initialState: ProjectFormState = {};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** Form tambah proyek: nama, klien, dana yang disiapkan, dan rentang tanggal. */
export function ProjectForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState(createProject, initialState);
  const [values, setValues] = useState({
    name: "",
    client: "",
    budget: "",
    startDate: today,
    endDate: "",
  });
  const [makeActive, setMakeActive] = useState(true);
  const online = useOnline();

  // Pesan error suatu kolom hilang begitu kolom itu diubah; di-reset tiap kali form dikirim.
  const [lastState, setLastState] = useState(state);
  const [edited, setEdited] = useState<ProjectField[]>([]);
  if (state !== lastState) {
    setLastState(state);
    setEdited([]);
  }
  const error = (field: ProjectField) => (edited.includes(field) ? undefined : state.errors?.[field]);
  const set = (field: ProjectField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setEdited((prev) => (prev.includes(field) ? prev : [...prev, field]));
  };
  const describedBy = (field: ProjectField) => (error(field) ? `${field}-error` : undefined);

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nama proyek</Label>
        <Input
          id="name"
          name="name"
          autoFocus
          autoComplete="off"
          maxLength={80}
          placeholder="Mis. Pemetaan Batas Desa Sukamaju"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          aria-invalid={!!error("name")}
          aria-describedby={describedBy("name")}
          className="h-11"
        />
        <FieldError id="name-error" message={error("name")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="client">
          Klien / pemberi kerja <span className="font-normal text-muted-foreground">(opsional)</span>
        </Label>
        <Input
          id="client"
          name="client"
          autoComplete="off"
          maxLength={80}
          placeholder="Mis. Dinas PUPR Kab. Garut"
          value={values.client}
          onChange={(e) => set("client", e.target.value)}
          aria-invalid={!!error("client")}
          aria-describedby={describedBy("client")}
          className="h-11"
        />
        <FieldError id="client-error" message={error("client")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="budget">Dana yang disiapkan</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg font-medium text-muted-foreground">
            Rp
          </span>
          <Input
            id="budget"
            name="budget"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={formatDigits(values.budget)}
            onChange={(e) => set("budget", e.target.value.replace(/\D/g, "").slice(0, 12))}
            aria-invalid={!!error("budget")}
            aria-describedby={describedBy("budget") ?? "budget-hint"}
            className="h-14 pl-11 text-2xl font-semibold tabular-nums md:text-2xl"
          />
        </div>
        {error("budget") ? (
          <FieldError id="budget-error" message={error("budget")} />
        ) : (
          <p id="budget-hint" className="text-xs text-muted-foreground">
            Uang muka dari kantor untuk proyek ini. Tambahan dana nanti dicatat sebagai pemasukan.
          </p>
        )}
        <ConvertedHint amount={Number(values.budget || 0)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="startDate">Mulai</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            value={values.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            aria-invalid={!!error("startDate")}
            aria-describedby={describedBy("startDate")}
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="endDate">
            Selesai <span className="font-normal text-muted-foreground">(opsional)</span>
          </Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            min={values.startDate || undefined}
            value={values.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            aria-invalid={!!error("endDate")}
            aria-describedby={describedBy("endDate")}
            className="h-11"
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <FieldError id="startDate-error" message={error("startDate")} />
          <FieldError id="endDate-error" message={error("endDate")} />
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input px-3 py-2.5 text-sm hover:bg-muted">
        <input
          type="checkbox"
          name="makeActive"
          checked={makeActive}
          onChange={(e) => setMakeActive(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
        />
        <span>
          <span className="font-medium">Langsung jadikan proyek aktif</span>
          <span className="block text-xs text-muted-foreground">
            Catatan transaksi berikutnya otomatis masuk ke proyek ini.
          </span>
        </span>
      </label>

      <div className="mt-auto flex flex-col gap-2">
        <OnlineOnlyHint action="Membuat proyek baru" />
        <Button type="submit" disabled={pending || !online} className="h-12 text-base">
          {pending ? "Menyimpan…" : "Simpan proyek"}
        </Button>
      </div>
    </form>
  );
}
