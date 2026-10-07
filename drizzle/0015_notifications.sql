CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link` text,
	`count` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`read_at` text,
	`resolved_at` text,
	`emailed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notifications_kind_valid" CHECK("notifications"."kind" IN ('backup_gagal')),
	CONSTRAINT "notifications_count_positive" CHECK("notifications"."count" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_one_open` ON `notifications` (`user_id`,`kind`) WHERE "notifications"."resolved_at" IS NULL;