"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { makeProjectActive, type SetActiveState } from "@/app/proyek/[id]/actions";
import { OnlineOnlyHint } from "@/components/local/online-only";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/local/replica-store";

const initialState: SetActiveState = {};

/** Tombol untuk menjadikan proyek ini tempat mencatat transaksi berikutnya. */
export function MakeActiveButton({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(makeProjectActive, initialState);
  const online = useOnline();

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <OnlineOnlyHint action="Mengganti proyek aktif" className="justify-center" />
      <Button type="submit" disabled={pending || !online} className="h-12 w-full text-base">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
        {pending ? "Memindahkan…" : "Jadikan proyek aktif"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Transaksi yang dicatat berikutnya masuk ke proyek ini. Saldo proyek lain tidak berubah.
      </p>
      {state.error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
