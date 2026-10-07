-- Nomor revisi hub (rev). Setiap baris tabel tersinkron yang disisipkan/diubah mendapat rev
-- baru dari sync_counter. Karena SQLite menulis satu per satu, urutan rev = urutan commit,
-- jadi perangkat yang menarik "rev > kursor" tidak akan melewatkan perubahan.
-- (recursive_triggers mati: trigger tidak memicu dirinya sendiri.)
INSERT INTO `sync_counter` (`id`, `value`) VALUES (1, 0) ON CONFLICT (`id`) DO NOTHING;
--> statement-breakpoint
-- Penanda updated_at tidak ikut naik bila yang berubah hanya rev.
DROP TRIGGER `projects_touch_updated_at`;
--> statement-breakpoint
CREATE TRIGGER `projects_touch_updated_at`
AFTER UPDATE ON `projects`
FOR EACH ROW
WHEN NEW.`updated_at` IS OLD.`updated_at` AND NEW.`rev` IS OLD.`rev`
BEGIN
	UPDATE `projects` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `projects_rev_insert`
AFTER INSERT ON `projects`
FOR EACH ROW
BEGIN
	UPDATE `sync_counter` SET `value` = `value` + 1 WHERE `id` = 1;
	UPDATE `projects` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `projects_rev_update`
AFTER UPDATE ON `projects`
FOR EACH ROW
WHEN NEW.`rev` IS OLD.`rev`
BEGIN
	UPDATE `sync_counter` SET `value` = `value` + 1 WHERE `id` = 1;
	UPDATE `projects` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
-- Penanda updated_at tidak ikut naik bila yang berubah hanya rev.
DROP TRIGGER `categories_touch_updated_at`;
--> statement-breakpoint
CREATE TRIGGER `categories_touch_updated_at`
AFTER UPDATE ON `categories`
FOR EACH ROW
WHEN NEW.`updated_at` IS OLD.`updated_at` AND NEW.`rev` IS OLD.`rev`
BEGIN
	UPDATE `categories` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `categories_rev_insert`
AFTER INSERT ON `categories`
FOR EACH ROW
BEGIN
	UPDATE `sync_counter` SET `value` = `value` + 1 WHERE `id` = 1;
	UPDATE `categories` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `categories_rev_update`
AFTER UPDATE ON `categories`
FOR EACH ROW
WHEN NEW.`rev` IS OLD.`rev`
BEGIN
	UPDATE `sync_counter` SET `value` = `value` + 1 WHERE `id` = 1;
	UPDATE `categories` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
-- Penanda updated_at tidak ikut naik bila yang berubah hanya rev.
DROP TRIGGER `transactions_touch_updated_at`;
--> statement-breakpoint
CREATE TRIGGER `transactions_touch_updated_at`
AFTER UPDATE ON `transactions`
FOR EACH ROW
WHEN NEW.`updated_at` IS OLD.`updated_at` AND NEW.`rev` IS OLD.`rev`
BEGIN
	UPDATE `transactions` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_rev_insert`
AFTER INSERT ON `transactions`
FOR EACH ROW
BEGIN
	UPDATE `sync_counter` SET `value` = `value` + 1 WHERE `id` = 1;
	UPDATE `transactions` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_rev_update`
AFTER UPDATE ON `transactions`
FOR EACH ROW
WHEN NEW.`rev` IS OLD.`rev`
BEGIN
	UPDATE `sync_counter` SET `value` = `value` + 1 WHERE `id` = 1;
	UPDATE `transactions` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
-- Penanda updated_at tidak ikut naik bila yang berubah hanya rev.
DROP TRIGGER `receipts_touch_updated_at`;
--> statement-breakpoint
CREATE TRIGGER `receipts_touch_updated_at`
AFTER UPDATE ON `receipts`
FOR EACH ROW
WHEN NEW.`updated_at` IS OLD.`updated_at` AND NEW.`rev` IS OLD.`rev`
BEGIN
	UPDATE `receipts` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `receipts_rev_insert`
AFTER INSERT ON `receipts`
FOR EACH ROW
BEGIN
	UPDATE `sync_counter` SET `value` = `value` + 1 WHERE `id` = 1;
	UPDATE `receipts` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `receipts_rev_update`
AFTER UPDATE ON `receipts`
FOR EACH ROW
WHEN NEW.`rev` IS OLD.`rev`
BEGIN
	UPDATE `sync_counter` SET `value` = `value` + 1 WHERE `id` = 1;
	UPDATE `receipts` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
-- Penanda updated_at tidak ikut naik bila yang berubah hanya rev.
DROP TRIGGER `settings_touch_updated_at`;
--> statement-breakpoint
CREATE TRIGGER `settings_touch_updated_at`
AFTER UPDATE ON `settings`
FOR EACH ROW
WHEN NEW.`updated_at` IS OLD.`updated_at` AND NEW.`rev` IS OLD.`rev`
BEGIN
	UPDATE `settings` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `settings_rev_insert`
AFTER INSERT ON `settings`
FOR EACH ROW
BEGIN
	UPDATE `sync_counter` SET `value` = `value` + 1 WHERE `id` = 1;
	UPDATE `settings` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `settings_rev_update`
AFTER UPDATE ON `settings`
FOR EACH ROW
WHEN NEW.`rev` IS OLD.`rev`
BEGIN
	UPDATE `sync_counter` SET `value` = `value` + 1 WHERE `id` = 1;
	UPDATE `settings` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
-- Beri rev pada baris yang sudah ada (urutan rowid), lalu majukan penghitung.
UPDATE `projects` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) + (SELECT count(*) FROM `projects` AS `x` WHERE `x`.rowid <= `projects`.rowid);
--> statement-breakpoint
UPDATE `sync_counter` SET `value` = `value` + (SELECT count(*) FROM `projects`) WHERE `id` = 1;
--> statement-breakpoint
UPDATE `categories` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) + (SELECT count(*) FROM `categories` AS `x` WHERE `x`.rowid <= `categories`.rowid);
--> statement-breakpoint
UPDATE `sync_counter` SET `value` = `value` + (SELECT count(*) FROM `categories`) WHERE `id` = 1;
--> statement-breakpoint
UPDATE `transactions` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) + (SELECT count(*) FROM `transactions` AS `x` WHERE `x`.rowid <= `transactions`.rowid);
--> statement-breakpoint
UPDATE `sync_counter` SET `value` = `value` + (SELECT count(*) FROM `transactions`) WHERE `id` = 1;
--> statement-breakpoint
UPDATE `receipts` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) + (SELECT count(*) FROM `receipts` AS `x` WHERE `x`.rowid <= `receipts`.rowid);
--> statement-breakpoint
UPDATE `sync_counter` SET `value` = `value` + (SELECT count(*) FROM `receipts`) WHERE `id` = 1;
--> statement-breakpoint
UPDATE `settings` SET `rev` = (SELECT `value` FROM `sync_counter` WHERE `id` = 1) + (SELECT count(*) FROM `settings` AS `x` WHERE `x`.rowid <= `settings`.rowid);
--> statement-breakpoint
UPDATE `sync_counter` SET `value` = `value` + (SELECT count(*) FROM `settings`) WHERE `id` = 1;
