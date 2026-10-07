-- Aturan soft delete (deleted_at). Foreign key RESTRICT/CASCADE hanya bekerja untuk DELETE
-- sungguhan, jadi untuk penghapusan bertanda aturannya dijaga trigger di sini.
-- 1) Kategori yang masih dipakai catatan (yang belum dihapus) tidak boleh dihapus.
CREATE TRIGGER `categories_soft_delete_in_use`
BEFORE UPDATE OF `deleted_at` ON `categories`
FOR EACH ROW
WHEN NEW.`deleted_at` IS NOT NULL AND OLD.`deleted_at` IS NULL AND EXISTS (
	SELECT 1 FROM `transactions` WHERE `category_id` = NEW.`id` AND `deleted_at` IS NULL
)
BEGIN
	SELECT RAISE(ABORT, 'category is still used by transactions');
END;
--> statement-breakpoint
-- 2) Catatan tidak boleh memakai kategori yang sudah dihapus.
CREATE TRIGGER `transactions_category_live_insert`
BEFORE INSERT ON `transactions`
FOR EACH ROW
WHEN (SELECT `deleted_at` FROM `categories` WHERE `id` = NEW.`category_id`) IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'category has been deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_category_live_update`
BEFORE UPDATE OF `category_id` ON `transactions`
FOR EACH ROW
WHEN (SELECT `deleted_at` FROM `categories` WHERE `id` = NEW.`category_id`) IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'category has been deleted');
END;
--> statement-breakpoint
-- 3) Catatan dihapus → lampirannya ikut ditandai terhapus (pengganti ON DELETE CASCADE).
CREATE TRIGGER `transactions_soft_delete_receipts`
AFTER UPDATE OF `deleted_at` ON `transactions`
FOR EACH ROW
WHEN NEW.`deleted_at` IS NOT NULL AND OLD.`deleted_at` IS NULL
BEGIN
	UPDATE `receipts` SET `deleted_at` = NEW.`deleted_at`
	WHERE `transaction_id` = NEW.`id` AND `deleted_at` IS NULL;
END;
