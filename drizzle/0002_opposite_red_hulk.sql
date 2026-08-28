CREATE TABLE `conversationMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`status` enum('active','left','removed') NOT NULL DEFAULT 'active',
	`mutedUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversationMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `conversation_members_pair_unique` UNIQUE(`conversationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdByUserId` int NOT NULL,
	`kind` enum('direct','group','merchant_support') NOT NULL,
	`title` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messageAttachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`byteSize` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messageAttachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messageDeliveryReceipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`recipientUserId` int NOT NULL,
	`status` enum('delivered','read') NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messageDeliveryReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_delivery_receipts_pair_unique` UNIQUE(`messageId`,`recipientUserId`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderUserId` int NOT NULL,
	`clientMessageId` varchar(64) NOT NULL,
	`payload` text NOT NULL,
	`contentType` enum('text','attachment','system') NOT NULL DEFAULT 'text',
	`status` enum('sending','sent','delivered','read','failed','deleted') NOT NULL DEFAULT 'sent',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`editedAt` timestamp,
	`deletedAt` timestamp,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `messages_conversation_client_id_unique` UNIQUE(`conversationId`,`clientMessageId`)
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`authorUserId` int NOT NULL,
	`textBody` varchar(700),
	`audience` enum('public','connections','custom','private') NOT NULL DEFAULT 'connections',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`publishedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`deletedAt` timestamp,
	CONSTRAINT `stories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `storyAudienceMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storyId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `storyAudienceMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `story_audience_members_pair_unique` UNIQUE(`storyId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `storyMedia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storyId` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`width` int,
	`height` int,
	`durationSeconds` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `storyMedia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `storyReactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storyId` int NOT NULL,
	`userId` int NOT NULL,
	`emoji` varchar(16) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `storyReactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `story_reactions_pair_unique` UNIQUE(`storyId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `storyViews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storyId` int NOT NULL,
	`viewerUserId` int NOT NULL,
	`viewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `storyViews_id` PRIMARY KEY(`id`),
	CONSTRAINT `story_views_pair_unique` UNIQUE(`storyId`,`viewerUserId`)
);
--> statement-breakpoint
CREATE INDEX `conversation_members_user_status_idx` ON `conversationMembers` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `conversations_creator_created_at_idx` ON `conversations` (`createdByUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `message_attachments_message_id_idx` ON `messageAttachments` (`messageId`);--> statement-breakpoint
CREATE INDEX `message_delivery_recipient_idx` ON `messageDeliveryReceipts` (`recipientUserId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `messages_conversation_created_at_idx` ON `messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `stories_author_created_at_idx` ON `stories` (`authorUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `stories_expiry_idx` ON `stories` (`expiresAt`,`deletedAt`);--> statement-breakpoint
CREATE INDEX `story_media_story_id_idx` ON `storyMedia` (`storyId`);