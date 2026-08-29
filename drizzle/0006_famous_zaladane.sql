ALTER TABLE `stories` ADD `isMemory` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `stories` ADD `storefrontId` int;--> statement-breakpoint
ALTER TABLE `stories` ADD `productName` varchar(160);--> statement-breakpoint
ALTER TABLE `stories` ADD `productDescription` varchar(280);--> statement-breakpoint
ALTER TABLE `stories` ADD `productPriceMinor` int;--> statement-breakpoint
ALTER TABLE `stories` ADD `productCurrencyCode` varchar(3);--> statement-breakpoint
CREATE INDEX `stories_memory_author_idx` ON `stories` (`authorUserId`,`isMemory`,`createdAt`);--> statement-breakpoint
CREATE INDEX `stories_storefront_memory_idx` ON `stories` (`storefrontId`,`isMemory`,`createdAt`);