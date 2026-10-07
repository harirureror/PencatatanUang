-- Nama kategori unik per pengguna & jenis (tanpa beda huruf besar/kecil), hanya yang belum dihapus.
-- Kategori bawaan (user_id NULL) dikelompokkan sebagai satu pemilik.
CREATE UNIQUE INDEX `categories_user_type_name_unique` ON `categories` (coalesce(`user_id`, ''), `type`, lower(`name`)) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
-- Validasi pengaturan lewat trigger (CHECK baru di SQLite butuh membuat ulang tabel, yang akan
-- menghapus trigger sinkronisasi tabel ini). Daftar harus sama dengan src/lib/money-settings.ts.
CREATE TRIGGER `settings_validate_insert` BEFORE INSERT ON `settings`
WHEN NEW.`currency` NOT IN ('IDR', 'USD', 'SGD', 'MYR')
  OR NEW.`number_format` NOT IN ('id-ID', 'en-US')
  OR NEW.`low_balance_threshold` < 0
BEGIN
  SELECT RAISE(ABORT, 'settings: mata uang / format angka / batas saldo tidak valid');
END;
--> statement-breakpoint
CREATE TRIGGER `settings_validate_update` BEFORE UPDATE OF `currency`, `number_format`, `low_balance_threshold` ON `settings`
WHEN NEW.`currency` NOT IN ('IDR', 'USD', 'SGD', 'MYR')
  OR NEW.`number_format` NOT IN ('id-ID', 'en-US')
  OR NEW.`low_balance_threshold` < 0
BEGIN
  SELECT RAISE(ABORT, 'settings: mata uang / format angka / batas saldo tidak valid');
END;
