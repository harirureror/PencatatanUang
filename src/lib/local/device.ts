// Identitas perangkat ini untuk sinkron multi-perangkat: id acak (UUID) yang disimpan sekali
// di perangkat, nama yang mudah dikenali, dan platformnya (web / android).
import { Capacitor } from "@capacitor/core";

export type DeviceInfo = { id: string; label: string; platform: "web" | "android" | "desktop" };

const ID_KEY = "uanglapangan:device-id";
let cached: DeviceInfo | null = null;

function browserName(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Browser";
}

function osName(ua: string): string {
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "perangkat";
}

/** Lupakan id perangkat (keluar akun): akun berikutnya mendaftarkan perangkat dengan id baru. */
export function forgetDeviceId() {
  cached = null;
  try {
    window.localStorage.removeItem(ID_KEY);
  } catch {
    // penyimpanan diblokir
  }
}

export function getDeviceInfo(): DeviceInfo {
  if (cached) return cached;
  let id: string | null = null;
  try {
    id = window.localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(ID_KEY, id);
    }
  } catch {
    id ??= crypto.randomUUID(); // penyimpanan diblokir: id hanya berlaku selama halaman terbuka
  }
  const ua = navigator.userAgent;
  const native = Capacitor.isNativePlatform();
  cached = {
    id,
    platform: native ? "android" : "web",
    label: native ? `Aplikasi Android (${osName(ua)})` : `${browserName(ua)} di ${osName(ua)}`,
  };
  return cached;
}
