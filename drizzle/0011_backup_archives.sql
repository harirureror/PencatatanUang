CREATE TABLE `backup_archives` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'proses' NOT NULL,
	`file_name` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`checksum` text,
	`drive_file_id` text,
	`project_count` integer DEFAULT 0 NOT NULL,
	`transaction_count` integer DEFAULT 0 NOT NULL,
	`receipt_count` integer DEFAULT 0 NOT NULL,
	`source_rev` integer,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "backup_archives_trigger_valid" CHECK("backup_archives"."trigger" IN ('terjadwal', 'manual')),
	CONSTRAINT "backup_archives_status_valid" CHECK("backup_archives"."status" IN ('proses', 'berhasil', 'gagal')),
	CONSTRAINT "backup_archives_counts_nonnegative" CHECK("backup_archives"."size_bytes" >= 0 AND "backup_archives"."project_count" >= 0 AND "backup_archives"."transaction_count" >= 0 AND "backup_archives"."receipt_count" >= 0),
	CONSTRAINT "backup_archives_completion" CHECK(("backup_archives"."status" = 'proses') = ("backup_archives"."completed_at" IS NULL) AND ("backup_archives"."status" <> 'gagal' OR "backup_archives"."error" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `backup_archives_user_created_idx` ON `backup_archives` (`user_id`,`created_at`);