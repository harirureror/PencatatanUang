-- has_receipt diturunkan dari tabel receipts, dan "tanpa struk" (no_receipt) tidak boleh
-- berdampingan dengan foto bukti. Drizzle tidak bisa mendeklarasikan trigger, jadi dijaga
-- lewat migrasi kustom ini (pola yang sama dengan 0001).
CREATE TRIGGER `receipts_after_insert`
AFTER INSERT ON `receipts`
FOR EACH ROW
BEGIN
	UPDATE `transactions` SET `has_receipt` = 1, `no_receipt` = 0 WHERE `id` = NEW.`transaction_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `receipts_after_delete`
AFTER DELETE ON `receipts`
FOR EACH ROW
BEGIN
	UPDATE `transactions`
	SET `has_receipt` = EXISTS (SELECT 1 FROM `receipts` WHERE `transaction_id` = OLD.`transaction_id`)
	WHERE `id` = OLD.`transaction_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_no_receipt_guard`
BEFORE UPDATE OF `no_receipt` ON `transactions`
FOR EACH ROW
WHEN NEW.`no_receipt` = 1 AND EXISTS (SELECT 1 FROM `receipts` WHERE `transaction_id` = NEW.`id`)
BEGIN
	SELECT RAISE(ABORT, 'transaction already has receipts');
END;
--> statement-breakpoint
-- Selaraskan data lama: sebelum tabel receipts ada, has_receipt diisi manual.
UPDATE `transactions`
SET `has_receipt` = EXISTS (SELECT 1 FROM `receipts` WHERE `transaction_id` = `transactions`.`id`);
