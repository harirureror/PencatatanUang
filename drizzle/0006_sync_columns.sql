ALTER TABLE `categories` ADD `updated_at` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `categories_user_updated_idx` ON `categories` (`user_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `projects_user_updated_idx` ON `projects` (`user_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `receipts` ADD `updated_at` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;--> statement-breakpoint
ALTER TABLE `receipts` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `receipts_updated_idx` ON `receipts` (`updated_at`);--> statement-breakpoint
ALTER TABLE `settings` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `transactions_user_updated_idx` ON `transactions` (`user_id`,`updated_at`);--> statement-breakpoint
-- Isi updated_at baris lama dari waktu pembuatannya (bukan tanggal epoch bawaan kolom).
UPDATE `categories` SET `updated_at` = `created_at` WHERE `updated_at` = '1970-01-01T00:00:00.000Z';--> statement-breakpoint
UPDATE `receipts` SET `updated_at` = `uploaded_at` WHERE `updated_at` = '1970-01-01T00:00:00.000Z';
