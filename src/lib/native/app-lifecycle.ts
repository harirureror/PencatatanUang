// Sinkron mengikuti siklus hidup aplikasi Android (event appStateChange dari @capacitor/app —
// visibilitychange WebView tidak selalu terpicu saat aplikasi berpindah):
// - kembali ke depan → sinkron (tarik perubahan perangkat lain, kirim antrean), paling sering
//   sekali per RESUME_SYNC_MIN_MS supaya buka-tutup cepat tidak boros kuota;
// - ke latar belakang → kirim antrean yang tersisa selagi sempat.

export const RESUME_SYNC_MIN_MS = 15_000;

export type LifecycleDeps = {
  online(): boolean;
  pending(): number;
  syncNow(): Promise<unknown>;
  flushOutbox(): Promise<unknown>;
  now?(): number;
};

export function createAppStateHandler(deps: LifecycleDeps) {
  let lastResumeSync = -Infinity;
  const now = deps.now ?? Date.now;
  return async function onAppStateChange(isActive: boolean): Promise<"sync" | "flush" | "skip"> {
    if (!deps.online()) return "skip";
    if (isActive) {
      if (now() - lastResumeSync < RESUME_SYNC_MIN_MS) return "skip";
      lastResumeSync = now();
      await deps.syncNow().catch(() => {});
      return "sync";
    }
    if (deps.pending() === 0) return "skip";
    await deps.flushOutbox().catch(() => {});
    return "flush";
  };
}
