"use client";

import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteTransaction } from "@/app/catat/actions";
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
import { Button } from "@/components/ui/button";
import { queueDelete } from "@/lib/local/replica-store";
import type { ReturnPath } from "@/lib/return-path";

type DeleteTransactionButtonProps = {
  id: string;
  /** Ringkasan catatan untuk teks konfirmasi, mis. "Pengeluaran Rp150.000 — Makan siang tim". */
  summary: string;
  returnTo: ReturnPath;
};

export function DeleteTransactionButton({ id, summary, returnTo }: DeleteTransactionButtonProps) {
  const router = useRouter();

  // Saat offline: hapus dari data di perangkat & masukkan antrean; dikirim saat online.
  function remove(formData: FormData) {
    if (!navigator.onLine) {
      queueDelete(id);
      // Offline: kembali ke halaman sebelumnya (cache router), bukan memuat halaman baru.
      if (window.history.length > 1) router.back();
      else router.push(returnTo);
      return;
    }
    return deleteTransaction(formData);
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="destructive" className="h-12 w-full text-base" />}
      >
        <Trash2 aria-hidden />
        Hapus catatan
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>Hapus catatan ini?</AlertDialogTitle>
          <AlertDialogDescription>
            {summary}. Saldo proyek akan dihitung ulang dan catatan tidak bisa dikembalikan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={remove} className="contents">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Batal</AlertDialogCancel>
            <ConfirmButton />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-10 bg-destructive text-white hover:bg-destructive/85"
    >
      {pending ? "Menghapus…" : "Ya, hapus"}
    </Button>
  );
}
