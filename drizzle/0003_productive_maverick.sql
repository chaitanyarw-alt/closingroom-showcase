ALTER TABLE `deals` ADD `targetCompany` varchar(255);--> statement-breakpoint
ALTER TABLE `deals` ADD `dealStructure` varchar(128);--> statement-breakpoint
ALTER TABLE `deals` ADD `dealStructureOther` varchar(255);--> statement-breakpoint
ALTER TABLE `deals` ADD `dealValue` varchar(255);--> statement-breakpoint
ALTER TABLE `deals` ADD `governingLaw` varchar(255);--> statement-breakpoint
ALTER TABLE `deals` ADD `longstopDate` timestamp;--> statement-breakpoint
ALTER TABLE `deals` ADD `buyerName` varchar(255);--> statement-breakpoint
ALTER TABLE `deals` ADD `sellerName` varchar(255);--> statement-breakpoint
ALTER TABLE `deals` ADD `buyerCounsel` varchar(255);--> statement-breakpoint
ALTER TABLE `deals` ADD `sellerCounsel` varchar(255);