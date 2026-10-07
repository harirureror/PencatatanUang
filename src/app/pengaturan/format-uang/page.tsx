import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";

import { MoneyFormatForm } from "@/components/pengaturan/money-format-form";
import { getMoneyFormat } from "@/server/money";
import { getExchangeRates } from "@/server/exchange-rates";

export const metadata = { title: "Format uang · UangLapangan" };

export default async function FormatUangPage() {
  await connection();
  const [format, rates] = await Promise.all([getMoneyFormat(), getExchangeRates()]);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center gap-3">
        <Link
          href="/pengaturan"
          aria-label="Kembali ke Pengaturan"
          className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Format uang</h1>
          <p className="text-sm text-muted-foreground">Mata uang dan cara penulisan angka</p>
        </div>
      </header>
      <MoneyFormatForm initial={format} rates={rates ? { date: rates.date, fromIDR: rates.fromIDR } : null} />
    </main>
  );
}
