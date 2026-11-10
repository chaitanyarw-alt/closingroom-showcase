CREATE TABLE `slack_workspace_links` (
	`teamId` varchar(64) NOT NULL,
	`ownerUserId` int NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `slack_workspace_links_teamId` PRIMARY KEY(`teamId`)
);
--> statement-breakpoint
ALTER TABLE `slack_intakes` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `deals` ADD `archivedAt` bigint;--> statement-breakpoint
ALTER TABLE `deals` ADD `deletedAt` bigint;--> statement-breakpoint
ALTER TABLE `deals` ADD `isTestData` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `slack_intakes` ADD `teamId` varchar(64);