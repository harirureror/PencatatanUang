// Tabel yang ikut sinkronisasi multi-perangkat (PRD Fase 6). Semuanya ber-id UUID dan punya
// kolom `updated_at` (versi terakhir), `deleted_at` (soft delete) dan `rev` (nomor revisi
// hub). `users` tidak ikut — dikelola server (Better Auth). Mesin sinkron memakai daftar ini
// untuk menarik baris yang berubah sejak sinkron terakhir: WHERE rev > :kursor (termasuk
// baris terhapus), lalu menyimpan rev tertinggi sebagai kursor baru.
import { categories, projects, receipts, settings, transactions } from "./schema";

export const SYNCED_TABLES = { projects, categories, transactions, receipts, settings } as const;

export type SyncedTableName = keyof typeof SYNCED_TABLES;
