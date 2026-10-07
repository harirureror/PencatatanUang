-- Jenis transaksi (income/expense) harus sama dengan jenis kategorinya.
-- Drizzle tidak bisa mendeklarasikan trigger, jadi dijaga lewat migrasi kustom ini.
CREATE TRIGGER `transactions_category_type_match_insert`
BEFORE INSERT ON `transactions`
FOR EACH ROW
WHEN NEW.`type` <> (SELECT `type` FROM `categories` WHERE `id` = NEW.`category_id`)
BEGIN
	SELECT RAISE(ABORT, 'transaction type does not match category type');
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_category_type_match_update`
BEFORE UPDATE OF `type`, `category_id` ON `transactions`
FOR EACH ROW
WHEN NEW.`type` <> (SELECT `type` FROM `categories` WHERE `id` = NEW.`category_id`)
BEGIN
	SELECT RAISE(ABORT, 'transaction type does not match category type');
END;
