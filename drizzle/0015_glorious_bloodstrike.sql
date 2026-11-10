ALTER TABLE `deals` ADD `isSeedData` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `slack_intakes` ADD `ownerUserId` int;