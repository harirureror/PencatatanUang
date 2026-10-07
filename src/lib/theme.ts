// Tema tampilan: terang, gelap, atau ikuti pengaturan HP/komputer. Disimpan per perangkat.

export type ThemeChoice = "terang" | "gelap" | "sistem";

export const THEME_KEY = "uanglapangan:tema";
const THEME_EVENT = "uanglapangan:tema";

/** Warna bilah status / address bar per tema (sama dengan --background masing-masing). */
export const THEME_COLORS = { terang: "#0f5c45", gelap: "#0b1512" } as const;

/**
 * Skrip kecil di <head>: pasang kelas `dark` SEBELUM halaman digambar (tanpa kedip putih).
 * Harus mandiri (tanpa import) karena disisipkan sebagai teks.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"sistem";var d=c==="gelap"||(c==="sistem"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;

export function readThemeChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "terang" || v === "gelap" ? v : "sistem";
  } catch {
    return "sistem";
  }
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Terapkan tema ke halaman (kelas `dark`, color-scheme, warna bilah status). */
export function applyTheme(choice: ThemeChoice = readThemeChoice()) {
  const dark = choice === "gelap" || (choice === "sistem" && systemDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute("content", dark ? THEME_COLORS.gelap : THEME_COLORS.terang));
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "sistem") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // penyimpanan diblokir — tema hanya berlaku sampai halaman ditutup
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Berlangganan perubahan pilihan tema (tab lain / tombol) dan tema sistem. */
export function subscribeTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readThemeChoice() === "sistem") applyTheme("sistem");
    onChange();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    applyTheme();
    onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystem);
  };
}
