-- Trigger lampiran dari 0003 dibuat sebelum ada soft delete: lampiran bertanda deleted_at masih
-- dihitung. Diperbaiki agar hanya lampiran yang belum dihapus yang dianggap ada.
DROP TRIGGER `transactions_no_receipt_guard`;
--> statement-breakpoint
CREATE TRIGGER `transactions_no_receipt_guard`
BEFORE UPDATE OF `no_receipt` ON `transactions`
FOR EACH ROW
WHEN NEW.`no_receipt` = 1 AND EXISTS (
	SELECT 1 FROM `receipts` WHERE `transaction_id` = NEW.`id` AND `deleted_at` IS NULL
)
BEGIN
	SELECT RAISE(ABORT, 'transaction already has receipts');
END;
--> statement-breakpoint
-- Lampiran ditandai terhapus / dipulihkan → has_receipt transaksinya dihitung ulang.
CREATE TRIGGER `receipts_soft_delete_has_receipt`
AFTER UPDATE OF `deleted_at` ON `receipts`
FOR EACH ROW
WHEN NEW.`deleted_at` IS NOT OLD.`deleted_at`
BEGIN
	UPDATE `transactions`
	SET `has_receipt` = EXISTS (
		SELECT 1 FROM `receipts` WHERE `transaction_id` = NEW.`transaction_id` AND `deleted_at` IS NULL
	)
	WHERE `id` = NEW.`transaction_id`;
END;
