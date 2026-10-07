-- updated_at selalu naik setiap kali baris berubah — juga untuk perubahan yang tidak lewat
-- Drizzle (mis. trigger has_receipt di 0003, lepas proyek aktif di 0005). Sinkronisasi
-- multi-perangkat menarik baris dengan updated_at > waktu sinkron terakhir, jadi perubahan
-- tanpa kenaikan updated_at tidak akan sampai ke perangkat lain.
-- (recursive_triggers mati secara bawaan, jadi UPDATE di dalam trigger tidak memicu ulang.)
CREATE TRIGGER `projects_touch_updated_at`
AFTER UPDATE ON `projects`
FOR EACH ROW
WHEN NEW.`updated_at` IS OLD.`updated_at`
BEGIN
	UPDATE `projects` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `categories_touch_updated_at`
AFTER UPDATE ON `categories`
FOR EACH ROW
WHEN NEW.`updated_at` IS OLD.`updated_at`
BEGIN
	UPDATE `categories` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_touch_updated_at`
AFTER UPDATE ON `transactions`
FOR EACH ROW
WHEN NEW.`updated_at` IS OLD.`updated_at`
BEGIN
	UPDATE `transactions` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `receipts_touch_updated_at`
AFTER UPDATE ON `receipts`
FOR EACH ROW
WHEN NEW.`updated_at` IS OLD.`updated_at`
BEGIN
	UPDATE `receipts` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `settings_touch_updated_at`
AFTER UPDATE ON `settings`
FOR EACH ROW
WHEN NEW.`updated_at` IS OLD.`updated_at`
BEGIN
	UPDATE `settings` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
-- Baris categories yang disisipkan tanpa updated_at (default epoch) diberi waktu sebenarnya.
CREATE TRIGGER `categories_stamp_updated_at`
AFTER INSERT ON `categories`
FOR EACH ROW
WHEN NEW.`updated_at` = '1970-01-01T00:00:00.000Z'
BEGIN
	UPDATE `categories` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
-- Baris receipts yang disisipkan tanpa updated_at (default epoch) diberi waktu sebenarnya.
CREATE TRIGGER `receipts_stamp_updated_at`
AFTER INSERT ON `receipts`
FOR EACH ROW
WHEN NEW.`updated_at` = '1970-01-01T00:00:00.000Z'
BEGIN
	UPDATE `receipts` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
