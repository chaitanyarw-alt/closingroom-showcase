CREATE TABLE `conversation_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `conversation_threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `audit_log` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `chat_messages` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `checklist_items` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `deal_members` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `deals` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `documents` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `signature_pages` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `waiver_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `audit_log` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `chat_messages` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `checklist_items` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `deal_members` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `deals` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `aiProcessed` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `aiProcessed` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `signature_pages` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `waiver_records` MODIFY COLUMN `waivedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);