CREATE TABLE `slack_intakes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int,
	`channelId` varchar(64) NOT NULL,
	`threadTs` varchar(64),
	`requesterSlackUserId` varchar(64),
	`requesterName` varchar(255),
	`question` text NOT NULL,
	`aiDraft` text,
	`approvedResponse` text,
	`status` enum('received','drafted','approved','rejected','posted','failed') NOT NULL DEFAULT 'received',
	`reviewerUserId` int,
	`reviewNote` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`reviewedAt` timestamp,
	`postedAt` timestamp
);
--> statement-breakpoint
CREATE INDEX `slack_intakes_status_idx` ON `slack_intakes` (`status`);--> statement-breakpoint
CREATE INDEX `slack_intakes_deal_idx` ON `slack_intakes` (`dealId`);