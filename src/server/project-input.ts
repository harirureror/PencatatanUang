export type ProjectField = "name" | "client" | "budget" | "startDate" | "endDate";
export type ProjectFieldErrors = Partial<Record<ProjectField, string>>;

export type ProjectInput = {
  name: string;
  client: string | null;
  budget: number;
  startDate: string;
  endDate: string | null;
};

const MAX_NAME = 80;
const MAX_BUDGET = 999_999_999_999;

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Dana dari JSON (angka bulat) atau isian form ("5.000.000" → 5000000). Kosong → NaN. */
function parseBudget(value: unknown): number {
  if (typeof value === "number") return Number.isInteger(value) ? value : NaN;
  if (typeof value === "string" && /\d/.test(value)) return Number(value.replace(/\D/g, ""));
  return NaN;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/**
 * Validasi isian proyek baru — dipakai bersama oleh form (Server Action) dan endpoint.
 * `raw` boleh dari body JSON atau FormData (Object.fromEntries).
 */
export function validateProjectInput(
  raw: Record<string, unknown>,
): { data: ProjectInput } | { errors: ProjectFieldErrors } {
  const errors: ProjectFieldErrors = {};

  const name = text(raw.name);
  if (!name) errors.name = "Nama proyek belum diisi.";
  else if (name.length > MAX_NAME) errors.name = `Nama proyek maksimal ${MAX_NAME} huruf.`;

  const client = text(raw.client);
  if (client.length > MAX_NAME) errors.client = `Nama klien maksimal ${MAX_NAME} huruf.`;

  const budget = parseBudget(raw.budget);
  if (Number.isNaN(budget)) errors.budget = "Isi dana yang disiapkan untuk proyek ini.";
  else if (!Number.isSafeInteger(budget) || budget < 0 || budget > MAX_BUDGET) {
    errors.budget = "Dana harus berupa angka Rupiah yang wajar.";
  }

  const startDate = text(raw.startDate);
  if (!isValidISODate(startDate)) errors.startDate = "Tanggal mulai tidak valid.";

  const endDateRaw = text(raw.endDate);
  const endDate = endDateRaw || null;
  if (endDate && !isValidISODate(endDate)) errors.endDate = "Tanggal selesai tidak valid.";
  else if (endDate && !errors.startDate && endDate < startDate) {
    errors.endDate = "Tanggal selesai tidak boleh sebelum tanggal mulai.";
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { data: { name, client: client || null, budget, startDate, endDate } };
}
