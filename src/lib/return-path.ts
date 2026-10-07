/** Halaman yang boleh dituju setelah form disimpan — mencegah open redirect. */
const RETURN_PATHS = ["/", "/transaksi"] as const;

export type ReturnPath = (typeof RETURN_PATHS)[number];

export function toReturnPath(value: unknown): ReturnPath {
  return RETURN_PATHS.find((p) => p === value) ?? "/";
}

/** URL halaman ubah catatan; tanpa ?kembali berarti kembali ke /transaksi. */
export function ubahHref(id: string, returnTo: ReturnPath = "/transaksi"): string {
  const base = `/transaksi/${encodeURIComponent(id)}`;
  return returnTo === "/transaksi" ? base : `${base}?kembali=${encodeURIComponent(returnTo)}`;
}

/** URL halaman lampiran struk sebuah catatan. */
export function strukHref(id: string, returnTo: ReturnPath = "/transaksi"): string {
  const base = `/transaksi/${encodeURIComponent(id)}/struk`;
  return returnTo === "/transaksi" ? base : `${base}?kembali=${encodeURIComponent(returnTo)}`;
}

/** URL form catat: /catat, /catat?jenis=pemasukan, /catat?kembali=%2Ftransaksi, dst. */
export function catatHref(type: "income" | "expense", returnTo: ReturnPath = "/"): string {
  const params = new URLSearchParams();
  if (type === "income") params.set("jenis", "pemasukan");
  if (returnTo !== "/") params.set("kembali", returnTo);
  const qs = params.toString();
  return qs ? `/catat?${qs}` : "/catat";
}
