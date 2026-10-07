PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`client` text,
	`budget` integer DEFAULT 0 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`status` text DEFAULT 'aktif' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "projects_name_not_blank" CHECK(length(trim("__new_projects"."name")) > 0),
	CONSTRAINT "projects_budget_nonnegative" CHECK("__new_projects"."budget" >= 0),
	CONSTRAINT "projects_status_valid" CHECK("__new_projects"."status" IN ('aktif', 'selesai', 'arsip')),
	CONSTRAINT "projects_start_date_valid" CHECK(date("__new_projects"."start_date") IS "__new_projects"."start_date"),
	CONSTRAINT "projects_end_date_valid" CHECK("__new_projects"."end_date" IS NULL OR (date("__new_projects"."end_date") IS "__new_projects"."end_date" AND "__new_projects"."end_date" >= "__new_projects"."start_date"))
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "user_id", "name", "client", "budget", "start_date", "end_date", "status", "created_at", "updated_at") SELECT "id", "user_id", "name", "client", "budget", "start_date", "end_date", "status", "created_at", "created_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`user_id`);