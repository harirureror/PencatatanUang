CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`file_url` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "receipts_size_positive" CHECK("receipts"."size_bytes" > 0),
	CONSTRAINT "receipts_mime_image" CHECK("receipts"."mime_type" LIKE 'image/%')
);
--> statement-breakpoint
CREATE INDEX `receipts_transaction_idx` ON `receipts` (`transaction_id`,`uploaded_at`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `no_receipt` integer DEFAULT false NOT NULL;