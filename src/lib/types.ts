// Bentuk data mengikuti skema di PRD (tabel projects & transactions).

export type ProjectStatus = "aktif" | "selesai" | "arsip"

export type Project = {
  id: string
  name: string
  client: string | null
  budget: number
  startDate: string // YYYY-MM-DD
  endDate: string | null
  status: ProjectStatus
}

/** Proyek beserta ringkasan saldonya — untuk daftar & detail proyek. */
export type ProjectSummary = Project & {
  totalIncome: number
  totalExpense: number
  balance: number
  transactionCount: number
}

export type TransactionType = "income" | "expense"

export type Category = {
  id: string
  name: string
  type: TransactionType
  isDefault: boolean
}

export type Transaction = {
  id: string
  projectId: string
  categoryId: string
  type: TransactionType
  amount: number
  description: string
  transactionDate: string // YYYY-MM-DD
  /** Ada minimal satu foto bukti (dihitung server dari tabel receipts). */
  hasReceipt: boolean
  /** Ditandai "tanpa struk"; lepas otomatis saat foto pertama ditambahkan. */
  noReceipt: boolean
}

/** Lampiran foto bukti (struk/nota) sebuah transaksi — tabel receipts di PRD. */
export type Receipt = {
  id: string
  transactionId: string
  fileUrl: string
  fileName: string
  uploadedAt: string // ISO datetime
}

/** Kontrak data halaman utama — nanti dilayani endpoint ringkasan saldo proyek aktif. */
export type DashboardSummary = {
  project: Project
  balance: number
  totalIncome: number
  totalExpense: number
  lowBalanceThreshold: number
}
