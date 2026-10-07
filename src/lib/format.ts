const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

/** Isian angka di form: "1250000" → "1.250.000" (kosong tetap kosong). */
export function formatDigits(digits: string): string {
  return digits ? Number(digits).toLocaleString("id-ID") : ""
}

/** 1250000 → "Rp1.250.000" */
export function formatRupiah(amount: number): string {
  return rupiah.format(amount).replace(/\s/g, "")
}

const tanggal = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

/** Tanggal hari ini (WIB) dalam format YYYY-MM-DD. */
export function todayISO(timeZone = "Asia/Jakarta"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date())
}

/** "2026-09-28" → "28 Sep 2026" */
export function formatTanggal(isoDate: string): string {
  return tanggal.format(new Date(`${isoDate}T00:00:00`))
}

const tanggalPanjang = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "short",
  year: "numeric",
})

/** "2026-09-28" → "Senin, 28 Sep 2026" */
export function formatTanggalPanjang(isoDate: string): string {
  return tanggalPanjang.format(new Date(`${isoDate}T00:00:00`))
}

/** Geser tanggal YYYY-MM-DD sejumlah hari (tanpa terpengaruh zona waktu). */
export function shiftISODate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
