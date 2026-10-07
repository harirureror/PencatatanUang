import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

// Lokal: file SQLite. Produksi (mis. Vercel): URL Turso/libSQL + DATABASE_AUTH_TOKEN.
export const DATABASE_URL = process.env.DATABASE_URL ?? "file:./data/uanglapangan.db";

// Satu koneksi dipakai ulang, termasuk saat hot reload di mode dev.
const globalForDb = globalThis as typeof globalThis & { __libsql?: Client };
const client =
  globalForDb.__libsql ??
  createClient({ url: DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
if (process.env.NODE_ENV !== "production") globalForDb.__libsql = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
