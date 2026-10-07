/**
 * Penjaga tombol back Android. Komponen yang perlu menahan "kembali" (form dengan isian
 * belum tersimpan, penampil foto layar penuh) memasang penjaga; NativeBridge menanyakannya
 * sebelum kembali ke halaman sebelumnya. Penjaga terakhir dipasang ditanya lebih dulu —
 * mis. penampil foto yang terbuka di atas form ditutup dulu sebelum form ditanya.
 * Penjaga mengembalikan `true` bila boleh kembali.
 */
type BackGuard = () => boolean;

const guards: BackGuard[] = [];

/** Pasang penjaga; kembalikan fungsi untuk melepasnya. */
export function setBackGuard(guard: BackGuard): () => void {
  guards.push(guard);
  return () => {
    const i = guards.lastIndexOf(guard);
    if (i !== -1) guards.splice(i, 1);
  };
}

export function canGoBack(): boolean {
  const top = guards.at(-1);
  return top ? top() : true;
}
