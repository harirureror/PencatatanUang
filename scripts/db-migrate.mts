// Terapkan migrasi database (folder drizzle/) ke DATABASE_URL — file SQLite lokal atau Turso.
// Pengganti `drizzle-kit migrate`, yang keluar tanpa pesan galat apa pun bila gagal ke database
// remote. Skrip ini memeriksa env dulu, mencetak tiap langkah, dan menampilkan galat dengan jelas.
// Jalankan: npm run db:migrate
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.DATABASE_URL ?? "file:./data/uanglapangan.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const remote = !url.startsWith("file:");

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// Sisa contoh / salin-tempel yang salah (mis. tanda "…" atau spasi) — beri tahu dengan jelas.
const nonAscii = (v: string) => /[^\x21-\x7e]/.test(v);
if (nonAscii(url)) fail("DATABASE_URL berisi karakter tidak valid (mis. tanda … atau spasi). Tempel URL asli dari dasbor Turso.");
if (remote && !/^(libsql|https|wss):\/\/[a-z0-9.-]+/i.test(url)) fail("DATABASE_URL harus diawali libsql:// (dari dasbor Turso).");
if (remote && !authToken) fail("DATABASE_AUTH_TOKEN belum diisi (dasbor Turso → Create Token).");
if (authToken && nonAscii(authToken)) fail("DATABASE_AUTH_TOKEN berisi karakter tidak valid (mis. tanda … atau spasi). Tempel token asli.");

const host = remote ? new URL(url.replace(/^libsql:/, "https:")).host : url;
console.log(`→ Database: ${host}`);
const client = createClient({ url, authToken });

try {
  await client.execute("select 1");
} catch (error) {
  fail(`Tidak bisa terhubung: ${error instanceof Error ? error.message : String(error)}`);
}

const before = await client.execute("select count(*) as n from sqlite_master where type = 'table' and name = '__drizzle_migrations'");
const applied = Number(before.rows[0]?.n ?? 0)
  ? Number((await client.execute("select count(*) as n from __drizzle_migrations")).rows[0]?.n ?? 0)
  : 0;
console.log(`→ Migrasi yang sudah diterapkan: ${applied}`);

try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
} catch (error) {
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
  fail(`Migrasi gagal: ${error instanceof Error ? error.message : String(error)}${cause}`);
}

const after = Number((await client.execute("select count(*) as n from __drizzle_migrations")).rows[0]?.n ?? 0);
const tables = await client.execute("select count(*) as n from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'");
console.log(`✓ Selesai: ${after - applied} migrasi baru diterapkan (total ${after}), ${tables.rows[0]?.n} tabel.`);
client.close();
