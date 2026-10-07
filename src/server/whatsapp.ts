// Kirim pesan WhatsApp lewat Fonnte (https://fonnte.com — penyedia Indonesia, kirim dari nomor
// WhatsApp Anda sendiri). Aktif bila env FONNTE_TOKEN diisi (token perangkat dari dasbor Fonnte);
// tanpa itu pesan dilewati. Dipakai untuk kode atur ulang sandi akun nomor HP.

const TIMEOUT_MS = 8000;

export function whatsappConfigured(): boolean {
  return !!process.env.FONNTE_TOKEN;
}

/**
 * Kirim pesan ke nomor "+62…". true bila diterima Fonnte; false bila belum dikonfigurasi atau
 * gagal (tidak melempar galat — pemanggil memutuskan apa yang dilakukan).
 */
export async function sendWhatsApp(phoneE164: string, message: string): Promise<boolean> {
  if (!whatsappConfigured()) return false;
  try {
    const res = await fetch(process.env.FONNTE_API_URL ?? "https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: process.env.FONNTE_TOKEN! },
      // Fonnte menerima nomor internasional tanpa "+" (mis. 6281234567890).
      body: new URLSearchParams({ target: phoneE164.replace(/^\+/, ""), message }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; reason?: string } | null;
    if (!res.ok || body?.status === false) {
      console.warn("WhatsApp (Fonnte) ditolak:", res.status, body?.reason ?? "");
      return false;
    }
    return true;
  } catch (error) {
    console.warn("WhatsApp (Fonnte) gagal dikirim:", error instanceof Error ? error.message : error);
    return false;
  }
}
