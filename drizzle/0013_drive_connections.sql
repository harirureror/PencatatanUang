CREATE TABLE `drive_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`account_email` text NOT NULL,
	`refresh_token_enc` text,
	`access_token_enc` text,
	`access_expires_at` text,
	`scope` text,
	`folder_id` text,
	`status` text DEFAULT 'aktif' NOT NULL,
	`error` text,
	`connected_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "drive_connections_mode_valid" CHECK("drive_connections"."mode" IN ('google', 'simulasi')),
	CONSTRAINT "drive_connections_status_valid" CHECK("drive_connections"."status" IN ('aktif', 'perlu_dihubungkan')),
	CONSTRAINT "drive_connections_google_token" CHECK("drive_connections"."mode" <> 'google' OR "drive_connections"."refresh_token_enc" IS NOT NULL)
);
