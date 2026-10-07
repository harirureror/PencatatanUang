"use client";

import { useContext } from "react";

import { SessionContext } from "@/components/auth/session-provider";
import type { AuthUser } from "@/lib/auth-client";

/** Pengguna yang sedang masuk (null = belum / sudah keluar). */
export function useSession(): AuthUser | null {
  return useContext(SessionContext).user;
}

/** Perbarui sesi di browser setelah masuk / daftar / keluar. */
export function useSetSession(): (user: AuthUser | null) => void {
  return useContext(SessionContext).setUser;
}
