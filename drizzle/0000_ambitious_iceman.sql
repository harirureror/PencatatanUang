CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "categories_type_valid" CHECK("categories"."type" IN ('income', 'expense'))
);
--> statement-breakpoint
CREATE INDEX `categories_user_type_idx` ON `categories` (`user_id`,`type`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`client` text,
	`budget` integer DEFAULT 0 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`status` text DEFAULT 'aktif' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "projects_budget_nonnegative" CHECK("projects"."budget" >= 0),
	CONSTRAINT "projects_status_valid" CHECK("projects"."status" IN ('aktif', 'selesai', 'arsip'))
);
--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`active_project_id` text,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`number_format` text DEFAULT 'id-ID' NOT NULL,
	`low_balance_threshold` integer DEFAULT 1000000 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_user_unique` ON `settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`transaction_date` text NOT NULL,
	`has_receipt` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transactions_amount_positive" CHECK("transactions"."amount" > 0),
	CONSTRAINT "transactions_type_valid" CHECK("transactions"."type" IN ('income', 'expense'))
);
--> statement-breakpoint
CREATE INDEX `transactions_project_date_idx` ON `transactions` (`project_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);