import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/auth/session-provider";
import { MoneyFormatProvider } from "@/components/money/money-provider";
import { OfflineBanner } from "@/components/local/offline-banner";
import { SyncManager } from "@/components/local/sync-manager";
import { NativeBridge } from "@/components/native/native-bridge";
import { USER_ID_HEADER } from "@/server/current-user";
import { getMoneyDisplay } from "@/server/money";
import { getSessionUser } from "@/server/session";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UangLapangan",
  description: "Catat kas akomodasi lapangan per proyek, langsung dari HP.",
};

export const viewport: Viewport = {
  // Diperbarui saat tema diganti (lib/theme.ts).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.terang },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.gelap },
  ],
  width: "device-width",
  initialScale: 1,
  // Isi layar penuh di HP berponi / navigasi gestur; jarak aman diatur lewat env(safe-area-inset-*).
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = (await headers()).get(USER_ID_HEADER) ? await getSessionUser() : null;
  const moneyDisplay = await getMoneyDisplay();
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Kelas `dark` dipasang skrip tema sebelum React berjalan.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-muted/40 pt-[env(safe-area-inset-top)]">
        <SessionProvider initialUser={user}>
          <MoneyFormatProvider display={moneyDisplay}>
          <OfflineBanner />
          {children}
          {/* Sinkron hanya untuk yang sudah masuk (halaman masuk/daftar tidak perlu). */}
          {user && <SyncManager />}
          <NativeBridge />
          </MoneyFormatProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
