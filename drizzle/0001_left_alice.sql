CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`section` enum('conditions_precedent','transaction_documents','post_closing') NOT NULL,
	`title` varchar(512) NOT NULL,
	`status` enum('Executed','Pending','Outstanding','Waived') NOT NULL DEFAULT 'Pending',
	`notes` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `checklist_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deals_id` PRIMARY KEY(`id`)
);
