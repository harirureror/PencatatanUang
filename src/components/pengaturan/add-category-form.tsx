"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import {
  addCategoryAction,
  type CategoryActionState,
} from "@/app/pengaturan/kategori/actions";
import { OnlineOnlyHint } from "@/components/local/online-only";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/local/replica-store";
import { Input } from "@/components/ui/input";
import type { TransactionType } from "@/lib/types";

const initialState: CategoryActionState = {};

export function AddCategoryForm({ type }: { type: TransactionType }) {
  const [state, formAction, pending] = useActionState(addCategoryAction, initialState);
  const [name, setName] = useState("");
  const [lastState, setLastState] = useState(state);
  const [dirty, setDirty] = useState(false);
  const online = useOnline();

  // Isian dikosongkan hanya bila berhasil; bila gagal, isian dibiarkan untuk diperbaiki.
  if (state !== lastState) {
    setLastState(state);
    setDirty(false);
    if (state.savedAt) setName("");
  }
  const error = dirty ? undefined : state.error;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="type" value={type} />
      <label htmlFor="new-category" className="text-sm font-medium">
        Tambah kategori {type === "income" ? "pemasukan" : "pengeluaran"}
      </label>
      <div className="flex gap-2">
        <Input
          id="new-category"
          name="name"
          value={name}
          maxLength={30}
          autoComplete="off"
          placeholder={type === "income" ? "Mis. Reimburse klien" : "Mis. Sewa perahu, Porter"}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "new-category-error" : undefined}
          className="h-11 flex-1"
        />
        <Button type="submit" disabled={pending || !name.trim() || !online} className="h-11 px-4">
          <Plus aria-hidden />
          {pending ? "Menambah…" : "Tambah"}
        </Button>
      </div>
      <OnlineOnlyHint action="Mengubah daftar kategori" />
      {error && (
        <p id="new-category-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
