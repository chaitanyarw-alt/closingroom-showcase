ALTER TABLE `checklist_items` MODIFY COLUMN `party` enum('buyer_counsel','seller_counsel','bank','all','other') NOT NULL DEFAULT 'all';--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `partyLabel` varchar(255);--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `partyCustom` varchar(255);