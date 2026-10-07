// Kirim email pemberitahuan lewat Resend (https://resend.com, ada paket gratis).
// Aktif bila env RESEND_API_KEY dan NOTIFY_EMAIL_FROM (mis. "UangLapangan <notif@domainanda.id>")
// diisi; tanpa itu email dilewati — pemberitahuan tetap muncul di aplikasi.
export type Email = { to: string; subject: string; text: string };

export function mailerConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.NOTIFY_EMAIL_FROM;
}

/** true bila terkirim; false bila belum dikonfigurasi atau gagal (tidak melempar galat). */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!mailerConfigured()) return false;
  try {
    const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: process.env.NOTIFY_EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text }),
    });
    if (!res.ok) console.warn("Email pemberitahuan ditolak:", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (error) {
    console.warn("Email pemberitahuan gagal dikirim:", error);
    return false;
  }
}
