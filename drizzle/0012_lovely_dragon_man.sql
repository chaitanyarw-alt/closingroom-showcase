ALTER TABLE `deal_members` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `deal_members` MODIFY COLUMN `memberRole` enum('admin','editor','viewer') NOT NULL DEFAULT 'viewer';--> statement-breakpoint
ALTER TABLE `deal_members` ADD `email` varchar(320) NOT NULL;--> statement-breakpoint
ALTER TABLE `deal_members` ADD `name` varchar(255);--> statement-breakpoint
ALTER TABLE `deal_members` ADD `inviteToken` varchar(128);--> statement-breakpoint
ALTER TABLE `deal_members` ADD `inviteStatus` enum('pending','accepted') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `deal_members` ADD `lastAccessedAt` timestamp;--> statement-breakpoint
ALTER TABLE `deal_members` ADD CONSTRAINT `deal_members_deal_email_unique` UNIQUE(`dealId`,`email`);--> statement-breakpoint
ALTER TABLE `deal_members` DROP COLUMN `party`;