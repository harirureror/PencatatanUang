CREATE TABLE `sync_counter` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sync_counter_single_row" CHECK("sync_counter"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `sync_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`platform` text NOT NULL,
	`last_pulled_rev` integer DEFAULT 0 NOT NULL,
	`last_pulled_at` text,
	`last_pushed_at` text,
	`last_seen_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sync_devices_platform_valid" CHECK("sync_devices"."platform" IN ('web', 'android', 'desktop'))
);
--> statement-breakpoint
CREATE INDEX `sync_devices_user_idx` ON `sync_devices` (`user_id`);--> statement-breakpoint
ALTER TABLE `categories` ADD `rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `categories_rev_idx` ON `categories` (`rev`);--> statement-breakpoint
ALTER TABLE `projects` ADD `rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `projects_user_rev_idx` ON `projects` (`user_id`,`rev`);--> statement-breakpoint
ALTER TABLE `receipts` ADD `rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `receipts_rev_idx` ON `receipts` (`rev`);--> statement-breakpoint
ALTER TABLE `settings` ADD `rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `transactions_user_rev_idx` ON `transactions` (`user_id`,`rev`);