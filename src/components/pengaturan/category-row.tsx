"use client";

import { useActionState, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";

import {
  deleteCategoryAction,
  renameCategoryAction,
  type CategoryActionState,
} from "@/app/pengaturan/kategori/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryIcon } from "@/lib/category-icons";
import { useOnline } from "@/lib/local/replica-store";
import type { Category } from "@/lib/types";

const initialState: CategoryActionState = {};

type CategoryRowProps = {
  category: Category;
  /** Jumlah catatan yang memakai kategori ini. */
  usedCount: number;
};

export function CategoryRow({ category, usedCount }: CategoryRowProps) {
  const [editing, setEditing] = useState(false);
  const online = useOnline(); // ubah/hapus kategori butuh server

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      {editing ? (
        <RenameForm category={category} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CategoryIcon categoryId={category.id} className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{category.name}</p>
            <p className="text-xs text-muted-foreground">
              {usedCount > 0 ? `Dipakai ${usedCount} catatan` : "Belum dipakai"}
            </p>
          </div>
          {category.isDefault ? (
            <Badge variant="secondary">Bawaan</Badge>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`Ubah nama ${category.name}`}
                onClick={() => setEditing(true)}
                disabled={!online}
              >
                <Pencil />
              </Button>
              <DeleteCategoryButton category={category} usedCount={usedCount} disabled={!online} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function RenameForm({ category, onDone }: { category: Category; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: CategoryActionState, formData: FormData) => {
      const result = await renameCategoryAction(prev, formData);
      if (result.savedAt) onDone(); // tutup mode ubah setelah berhasil
      return result;
    },
    initialState,
  );
  const [name, setName] = useState(category.name);
  const inputId = `rename-${category.id}`;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={category.id} />
      <label htmlFor={inputId} className="sr-only">
        Nama baru untuk {category.name}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          name="name"
          value={name}
          maxLength={30}
          autoFocus
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onDone()}
          aria-invalid={!!state.error}
          className="h-10 flex-1"
        />
        <Button
          type="submit"
          size="icon-lg"
          disabled={pending || !name.trim()}
          aria-label="Simpan nama"
          className="size-10"
        >
          <Check />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="Batal ubah"
          onClick={onDone}
          className="size-10"
        >
          <X />
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

function DeleteCategoryButton({
  category,
  usedCount,
  disabled,
}: CategoryRowProps & { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(deleteCategoryAction, initialState);
  const inUse = usedCount > 0;

  return (
    <AlertDialog>
      <AlertDialogTrigger
        disabled={disabled}
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Hapus ${category.name}`}
            className="text-destructive hover:text-destructive"
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {inUse ? "Kategori masih dipakai" : `Hapus "${category.name}"?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {inUse
              ? `"${category.name}" dipakai ${usedCount} catatan. Ubah kategori catatan-catatan itu dulu, baru kategori ini bisa dihapus.`
              : "Kategori ini tidak akan muncul lagi saat mencatat transaksi."}
          </AlertDialogDescription>
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
        </AlertDialogHeader>
        <form action={formAction} className="contents">
          <input type="hidden" name="id" value={category.id} />
          <AlertDialogFooter>
            <AlertDialogCancel className={inUse ? "col-span-2 h-10" : "h-10"}>
              {inUse ? "Mengerti" : "Batal"}
            </AlertDialogCancel>
            {!inUse && (
              <Button
                type="submit"
                disabled={pending}
                className="h-10 bg-destructive text-white hover:bg-destructive/85"
              >
                {pending ? "Menghapus…" : "Ya, hapus"}
              </Button>
            )}
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
