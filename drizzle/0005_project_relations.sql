-- Relasi proyek ↔ transaksi ↔ proyek aktif yang tidak bisa dinyatakan lewat foreign key saja.
-- 1) Transaksi hanya boleh masuk ke proyek milik pencatatnya sendiri.
CREATE TRIGGER `transactions_project_owner_insert`
BEFORE INSERT ON `transactions`
FOR EACH ROW
WHEN NEW.`user_id` IS NOT (SELECT `user_id` FROM `projects` WHERE `id` = NEW.`project_id`)
BEGIN
	SELECT RAISE(ABORT, 'transaction project belongs to another user');
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_project_owner_update`
BEFORE UPDATE OF `project_id`, `user_id` ON `transactions`
FOR EACH ROW
WHEN NEW.`user_id` IS NOT (SELECT `user_id` FROM `projects` WHERE `id` = NEW.`project_id`)
BEGIN
	SELECT RAISE(ABORT, 'transaction project belongs to another user');
END;
--> statement-breakpoint
-- 2) Proyek aktif harus milik pengguna yang sama dan tidak berstatus arsip.
CREATE TRIGGER `settings_active_project_insert`
BEFORE INSERT ON `settings`
FOR EACH ROW
WHEN NEW.`active_project_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `projects`
	WHERE `id` = NEW.`active_project_id` AND `user_id` = NEW.`user_id` AND `status` <> 'arsip'
)
BEGIN
	SELECT RAISE(ABORT, 'active project must be an unarchived project of the same user');
END;
--> statement-breakpoint
CREATE TRIGGER `settings_active_project_update`
BEFORE UPDATE OF `active_project_id`, `user_id` ON `settings`
FOR EACH ROW
WHEN NEW.`active_project_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `projects`
	WHERE `id` = NEW.`active_project_id` AND `user_id` = NEW.`user_id` AND `status` <> 'arsip'
)
BEGIN
	SELECT RAISE(ABORT, 'active project must be an unarchived project of the same user');
END;
--> statement-breakpoint
-- 3) Proyek aktif yang diarsipkan otomatis dilepas — pencatatan berikutnya tidak masuk ke arsip.
CREATE TRIGGER `projects_archive_clears_active`
AFTER UPDATE OF `status` ON `projects`
FOR EACH ROW
WHEN NEW.`status` = 'arsip'
BEGIN
	UPDATE `settings` SET `active_project_id` = NULL WHERE `active_project_id` = NEW.`id`;
END;
--> statement-breakpoint
-- Data lama yang melanggar aturan 2 dilepas dulu (aturan 1 dicek manual sebelum migrasi).
UPDATE `settings` SET `active_project_id` = NULL
WHERE `active_project_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `projects`
	WHERE `projects`.`id` = `settings`.`active_project_id`
		AND `projects`.`user_id` = `settings`.`user_id`
		AND `projects`.`status` <> 'arsip'
);
