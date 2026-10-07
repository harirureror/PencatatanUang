/**
 * Warna status bar di aplikasi Android (Capacitor); di browser semua fungsi ini diam.
 * - "Dasar": warna yang mengikuti keadaan aplikasi (hijau normal, kuning saat offline).
 * - "Overlay": sementara menimpa dasar, mis. hitam selama penampil foto terbuka.
 */
export type StatusBarTheme = {
  color: string;
  /** Latar terang → ikon status bar gelap. */
  light?: boolean;
};

/** Warna status bar bawaan aplikasi (sama dengan themeColor & capacitor.config.ts). */
export const APP_STATUS_BAR: StatusBarTheme = { color: "#0f5c45" };
/** Selaras dengan pita offline (amber-100). */
export const OFFLINE_STATUS_BAR: StatusBarTheme = { color: "#fef3c7", light: true };

let base: StatusBarTheme = APP_STATUS_BAR;
let overlay: StatusBarTheme | null = null;

async function apply(theme: StatusBarTheme) {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  await StatusBar.setBackgroundColor({ color: theme.color }).catch(() => {});
  await StatusBar.setStyle({ style: theme.light ? Style.Light : Style.Dark }).catch(() => {});
}

export function setStatusBarBase(theme: StatusBarTheme): void {
  base = theme;
  if (!overlay) void apply(base);
}

/** Timpa sementara; `null` mengembalikan ke warna dasar. */
export function setStatusBarOverlay(theme: StatusBarTheme | null): void {
  overlay = theme;
  void apply(overlay ?? base);
}
