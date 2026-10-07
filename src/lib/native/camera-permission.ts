/**
 * Izin kamera untuk memotret struk.
 * - Aplikasi Android (Capacitor): izin runtime Android lewat @capacitor/camera.
 * - Browser: <input capture> membuka aplikasi kamera bawaan tanpa izin web, jadi selalu
 *   "granted" — kecuali status tiruan diset untuk mencoba tampilan izin di browser:
 *   localStorage["uanglapangan:mock-izin-kamera"] = "prompt" | "prompt-ditolak" | "denied".
 */
export type CameraPermission =
  /** Boleh langsung membuka kamera. */
  | "granted"
  /** Belum pernah ditanya. */
  | "prompt"
  /** Pernah ditolak sekali — Android masih mau menampilkan dialog izin lagi. */
  | "prompt-again"
  /** Ditolak permanen ("Jangan tanya lagi") — hanya bisa diubah dari Pengaturan HP. */
  | "denied";

const MOCK_KEY = "uanglapangan:mock-izin-kamera";

async function isNative(): Promise<boolean> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

function readMock(): string | null {
  try {
    return window.localStorage.getItem(MOCK_KEY);
  } catch {
    return null;
  }
}

function writeMock(value: string) {
  try {
    window.localStorage.setItem(MOCK_KEY, value);
  } catch {
    // abaikan — hanya data tiruan
  }
}

function fromMock(value: string | null): CameraPermission {
  if (value === "prompt" || value === "prompt-ditolak") return "prompt";
  if (value === "prompt-again" || value === "denied") return value;
  return "granted";
}

function fromNative(state: string): CameraPermission {
  if (state === "granted" || state === "limited") return "granted";
  if (state === "prompt-with-rationale") return "prompt-again";
  if (state === "denied") return "denied";
  return "prompt";
}

export async function checkCameraPermission(): Promise<CameraPermission> {
  if (!(await isNative())) return fromMock(readMock());
  const { Camera } = await import("@capacitor/camera");
  try {
    const { camera } = await Camera.checkPermissions();
    return fromNative(camera);
  } catch {
    return "granted"; // plugin tidak tersedia — biarkan WebView yang menangani
  }
}

/** Tampilkan dialog izin sistem Android; kembalikan status setelahnya. */
export async function requestCameraPermission(): Promise<CameraPermission> {
  if (!(await isNative())) {
    const mock = readMock();
    if (mock === null) return "granted";
    // Tiruan: "prompt-ditolak" mensimulasikan pengguna menolak dua kali hingga permanen.
    const next = mock === "prompt-ditolak" ? "denied" : "granted";
    writeMock(next);
    return fromMock(next);
  }
  const { Camera } = await import("@capacitor/camera");
  try {
    const { camera } = await Camera.requestPermissions({ permissions: ["camera"] });
    return fromNative(camera);
  } catch {
    return "denied";
  }
}
