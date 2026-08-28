CREATE TABLE `merchantOnboarding` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storefrontId` int,
	`profileComplete` boolean NOT NULL DEFAULT false,
	`catalogComplete` boolean NOT NULL DEFAULT false,
	`settlementComplete` boolean NOT NULL DEFAULT false,
	`status` enum('not_started','in_progress','ready','submitted') NOT NULL DEFAULT 'not_started',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchantOnboarding_id` PRIMARY KEY(`id`),
	CONSTRAINT `merchant_onboarding_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `merchantSettlementProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storefrontId` int NOT NULL,
	`countryCode` varchar(2) NOT NULL,
	`providerCode` varchar(64) NOT NULL,
	`recipientAlias` varchar(180) NOT NULL,
	`encryptedRecipientReference` text NOT NULL,
	`status` enum('pending','active','disabled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchantSettlementProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `merchant_settlement_storefront_unique` UNIQUE(`storefrontId`)
);
--> statement-breakpoint
CREATE TABLE `orderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productId` int NOT NULL,
	`productTitleSnapshot` varchar(180) NOT NULL,
	`unitPriceMinor` int NOT NULL,
	`quantity` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orderStatusEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`actorUserId` int,
	`status` enum('awaiting_payment','paid','accepted','preparing','ready','completed','cancelled','refunded') NOT NULL,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderStatusEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderReference` varchar(36) NOT NULL,
	`buyerUserId` int NOT NULL,
	`storefrontId` int NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`subtotalMinor` int NOT NULL,
	`feeMinor` int NOT NULL DEFAULT 0,
	`totalMinor` int NOT NULL,
	`status` enum('awaiting_payment','paid','accepted','preparing','ready','completed','cancelled','refunded') NOT NULL DEFAULT 'awaiting_payment',
	`buyerNote` varchar(800),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_reference_unique` UNIQUE(`orderReference`)
);
--> statement-breakpoint
CREATE TABLE `productMedia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productMedia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storefrontId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` varchar(1800),
	`category` varchar(100),
	`currencyCode` varchar(3) NOT NULL,
	`priceMinor` int NOT NULL,
	`inventoryQuantity` int,
	`status` enum('draft','active','archived','sold_out') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `storefronts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`slug` varchar(80) NOT NULL,
	`name` varchar(120) NOT NULL,
	`bio` varchar(700),
	`category` varchar(100),
	`avatarKey` varchar(512),
	`coverKey` varchar(512),
	`contactPhone` varchar(40),
	`contactEmail` varchar(320),
	`verificationState` enum('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
	`visibility` enum('draft','public','paused') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `storefronts_id` PRIMARY KEY(`id`),
	CONSTRAINT `storefronts_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `orderItems` (`orderId`);--> statement-breakpoint
CREATE INDEX `order_status_events_order_created_idx` ON `orderStatusEvents` (`orderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `orders_buyer_status_idx` ON `orders` (`buyerUserId`,`status`);--> statement-breakpoint
CREATE INDEX `orders_storefront_status_idx` ON `orders` (`storefrontId`,`status`);--> statement-breakpoint
CREATE INDEX `product_media_product_sort_idx` ON `productMedia` (`productId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `products_storefront_status_idx` ON `products` (`storefrontId`,`status`);--> statement-breakpoint
CREATE INDEX `products_category_status_idx` ON `products` (`category`,`status`);--> statement-breakpoint
CREATE INDEX `storefronts_owner_idx` ON `storefronts` (`ownerUserId`);--> statement-breakpoint
CREATE INDEX `storefronts_visibility_category_idx` ON `storefronts` (`visibility`,`category`);