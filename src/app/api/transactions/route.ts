import type { TransactionType } from "@/lib/types";
import { getCurrentUserId } from "@/server/current-user";
import { getProjectBalance } from "@/server/dashboard";
import { getActiveProject, getProject } from "@/server/projects";
import { applyCreate } from "@/server/transaction-ops";
import { listTransactions, MAX_PAGE_SIZE } from "@/server/transactions";

const noStore = { "Cache-Control": "no-store" };

/** Bilangan bulat ≥ 0 dari query string; undefined bila kosong, NaN bila tidak valid. */
function intParam(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

/**
 * GET /api/transactions — daftar transaksi + saldo.
 * Query: projectId? (default proyek aktif) · jenis? ("income" | "expense") · limit? (1–500) · offset?
 * 200 { data: { project, balance, totalIncome, totalExpense, total, transactions } }
 * 200 { data: null } bila tanpa projectId dan belum ada proyek aktif
 * 400 query tidak valid · 404 proyek tidak ditemukan
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const jenis = params.get("jenis");
  const limit = intParam(params.get("limit"));
  const offset = intParam(params.get("offset"));
  if (
    (jenis !== null && jenis !== "income" && jenis !== "expense") ||
    Number.isNaN(limit) ||
    Number.isNaN(offset) ||
    (limit !== undefined && (limit < 1 || limit > MAX_PAGE_SIZE))
  ) {
    return Response.json(
      { error: `Query tidak valid: jenis = income|expense, limit = 1–${MAX_PAGE_SIZE}, offset ≥ 0.` },
      { status: 400, headers: noStore },
    );
  }

  try {
    const userId = await getCurrentUserId();
    const projectId = params.get("projectId");
    const project = projectId ? await getProject(userId, projectId) : await getActiveProject(userId);
    if (!project) {
      return projectId
        ? Response.json({ error: "Proyek tidak ditemukan." }, { status: 404, headers: noStore })
        : Response.json({ data: null }, { headers: noStore });
    }

    const [balance, list] = await Promise.all([
      getProjectBalance(userId, project),
      listTransactions(userId, project.id, {
        type: (jenis as TransactionType | null) ?? undefined,
        limit,
        offset,
      }),
    ]);
    return Response.json(
      { data: { project, ...balance, total: list.total, transactions: list.items } },
      { headers: noStore },
    );
  } catch (error) {
    console.error("GET /api/transactions gagal:", error);
    return Response.json({ error: "Gagal memuat transaksi." }, { status: 500, headers: noStore });
  }
}

/**
 * POST /api/transactions — catat transaksi baru di proyek aktif.
 * Body JSON: { amount, categoryId, transactionDate (YYYY-MM-DD), description?, type? ("expense" | "income", default "expense"), id?, projectId?, noReceipt? }
 * `id` (UUID, opsional) = ID buatan perangkat saat mencatat offline. Idempoten: bila ID itu
 * sudah tersimpan, balasannya 200 dengan catatan yang sama (tidak digandakan).
 * `projectId` (opsional) = proyek tujuan; dikirim antrean offline agar catatan tidak pindah
 * proyek bila proyek aktif diganti sebelum terkirim. Kosong = proyek aktif.
 * 201 { data: Transaction } · 200 { data, replayed: true } · 400 body bukan JSON / id bukan UUID
 * 409 belum ada proyek aktif / id dipakai pengguna lain
 * 422 { error, fieldErrors } isian salah, atau proyek tujuan sudah dihapus/diarsipkan · 500 galat server
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON." }, { status: 400, headers: noStore });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Body harus berupa objek JSON." }, { status: 400, headers: noStore });
  }

  try {
    const result = await applyCreate(await getCurrentUserId(), body as Record<string, unknown>);
    switch (result.status) {
      case "applied":
        return Response.json(
          result.replayed ? { data: result.data, replayed: true } : { data: result.data },
          { status: result.http, headers: noStore },
        );
      case "invalid":
        return Response.json(
          { error: result.error, fieldErrors: result.fieldErrors },
          { status: result.http, headers: noStore },
        );
      default:
        return Response.json({ error: result.error }, { status: result.http, headers: noStore });
    }
  } catch (error) {
    console.error("POST /api/transactions gagal:", error);
    return Response.json({ error: "Gagal menyimpan transaksi." }, { status: 500, headers: noStore });
  }
}
