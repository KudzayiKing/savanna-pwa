CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int,
	`action` varchar(120) NOT NULL,
	`domain` varchar(64) NOT NULL,
	`targetId` varchar(96),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockerUserId` int NOT NULL,
	`blockedUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocks_pair_unique` UNIQUE(`blockerUserId`,`blockedUserId`)
);
--> statement-breakpoint
CREATE TABLE `consents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`scope` enum('payment_provider','marketing','course_progress','analytics','story_audience') NOT NULL,
	`policyVersion` varchar(32) NOT NULL,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`withdrawnAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deviceSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`deviceLabel` varchar(140) NOT NULL,
	`sessionFingerprint` varchar(128) NOT NULL,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deviceSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `privacySettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phoneVisibility` enum('nobody','connections') NOT NULL DEFAULT 'nobody',
	`handleDiscoverability` enum('exact_match','invite_only') NOT NULL DEFAULT 'exact_match',
	`storyAudienceDefault` enum('connections','custom','private') NOT NULL DEFAULT 'connections',
	`readReceiptsEnabled` boolean NOT NULL DEFAULT true,
	`lastSeenVisibility` enum('nobody','connections') NOT NULL DEFAULT 'connections',
	`courseProgressOptIn` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `privacySettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `privacy_settings_user_id_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(100) NOT NULL,
	`bio` varchar(500),
	`avatarKey` varchar(512),
	`countryCode` varchar(2),
	`city` varchar(120),
	`profileVisibility` enum('public','connections','private') NOT NULL DEFAULT 'connections',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `profiles_user_id_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterUserId` int NOT NULL,
	`targetDomain` enum('profile','story','storefront','product','course','message','payment') NOT NULL,
	`targetId` varchar(96) NOT NULL,
	`reason` enum('spam','impersonation','scam','harassment','unsafe_content','other') NOT NULL,
	`detail` varchar(1200),
	`evidenceScope` enum('none','selected_item','user_submitted') NOT NULL DEFAULT 'none',
	`status` enum('open','in_review','resolved','dismissed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userHandles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`handle` varchar(48) NOT NULL,
	`normalizedHandle` varchar(48) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `userHandles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_handles_normalized_handle_unique` UNIQUE(`normalizedHandle`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','support','finance') NOT NULL DEFAULT 'user';--> statement-breakpoint
CREATE INDEX `audit_events_actor_created_at_idx` ON `auditEvents` (`actorUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_events_domain_target_idx` ON `auditEvents` (`domain`,`targetId`);--> statement-breakpoint
CREATE INDEX `blocks_blocked_user_id_idx` ON `blocks` (`blockedUserId`);--> statement-breakpoint
CREATE INDEX `consents_user_scope_idx` ON `consents` (`userId`,`scope`);--> statement-breakpoint
CREATE INDEX `device_sessions_user_id_idx` ON `deviceSessions` (`userId`);--> statement-breakpoint
CREATE INDEX `reports_status_created_at_idx` ON `reports` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reports_target_idx` ON `reports` (`targetDomain`,`targetId`);--> statement-breakpoint
CREATE INDEX `user_handles_user_id_idx` ON `userHandles` (`userId`);