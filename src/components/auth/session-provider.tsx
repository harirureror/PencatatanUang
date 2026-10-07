"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { isPublicPath, signInHref } from "@/lib/auth-routes";
import { fetchSessionUser, type AuthUser } from "@/lib/auth-client";
import { claimLocalData } from "@/lib/local/account-scope";

type SessionContextValue = {
  user: AuthUser | null;
  /** Setelah masuk / daftar / keluar dari form (tanpa menunggu muat ulang). */
  setUser: (user: AuthUser | null) => void;
};

export const SessionContext = createContext<SessionContextValue>({ user: null, setUser: () => {} });

/** Jeda minimal antar-pemeriksaan sesi saat tab kembali aktif. */
const RECHECK_MS = 30_000;

/**
 * Sesi di browser. Awalnya dari server (layout); diperiksa ulang ke /api/akun/sesi saat tab
 * kembali aktif (keluar di tab lain, sesi dicabut setelah ganti sandi). Bila sesi hilang di
 * halaman yang butuh masuk → ke halaman masuk. Data perangkat milik akun lain dihapus.
 */
export function SessionProvider({ initialUser, children }: { initialUser: AuthUser | null; children: ReactNode }) {
  const [user, setUser] = useState(initialUser);
  const router = useRouter();
  const pathname = usePathname();
  const lastCheck = useRef(0);

  // Halaman baru dari server membawa sesi terbaru.
  const [lastInitial, setLastInitial] = useState(initialUser);
  if (initialUser?.id !== lastInitial?.id) {
    setLastInitial(initialUser);
    setUser(initialUser);
  }

  useEffect(() => {
    if (!user) return;
    void claimLocalData(user.id).then((cleared) => {
      // Data akun lain baru dihapus → muat ulang data akun ini dari server.
      if (cleared) router.refresh();
    });
  }, [user, router]);

  useEffect(() => {
    if (!user && !isPublicPath(pathname)) router.replace(signInHref(pathname + window.location.search));
  }, [user, pathname, router]);

  const recheck = useCallback(async () => {
    if (Date.now() - lastCheck.current < RECHECK_MS || !navigator.onLine) return;
    lastCheck.current = Date.now();
    try {
      const fresh = await fetchSessionUser();
      setUser((prev) => (prev?.id === fresh?.id ? prev : fresh));
    } catch {
      // Server tak terjangkau (offline) — tetap pakai sesi yang ada.
    }
  }, []);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void recheck();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [recheck]);

  const value = useMemo(() => ({ user, setUser }), [user]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
