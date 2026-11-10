CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`itemId` int,
	`userId` int NOT NULL,
	`userName` varchar(255),
	`action` varchar(128) NOT NULL,
	`fromValue` varchar(512),
	`toValue` varchar(512),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deal_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`userId` int NOT NULL,
	`party` enum('buyer_counsel','seller_counsel','bank','owner') NOT NULL,
	`memberRole` enum('owner','editor','viewer') NOT NULL DEFAULT 'viewer',
	`invitedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deal_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`filename` varchar(512) NOT NULL,
	`storageKey` varchar(1024) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`sizeBytes` int NOT NULL,
	`extractedText` text,
	`aiProcessed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signature_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`itemId` int,
	`signatoryName` varchar(255) NOT NULL,
	`signatoryParty` varchar(128) NOT NULL,
	`method` enum('wet_ink','electronic','counterpart') NOT NULL DEFAULT 'electronic',
	`status` enum('pending','received','rejected') NOT NULL DEFAULT 'pending',
	`receivedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signature_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `waiver_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`dealId` int NOT NULL,
	`approvedByUserId` int NOT NULL,
	`approvedByName` varchar(255),
	`approvedByParty` enum('buyer_counsel','seller_counsel','bank','owner') NOT NULL,
	`reason` text NOT NULL,
	`waivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waiver_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `party` enum('buyer_counsel','seller_counsel','bank','all') DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `assigneeUserId` int;--> statement-breakpoint
ALTER TABLE `checklist_items` ADD `deadline` timestamp;--> statement-breakpoint
ALTER TABLE `deals` ADD `closingDate` timestamp;