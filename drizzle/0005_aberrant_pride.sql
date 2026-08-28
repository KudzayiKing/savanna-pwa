CREATE TABLE `paymentIntents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentReference` varchar(36) NOT NULL,
	`payerUserId` int NOT NULL,
	`subjectType` enum('order','course_enrollment') NOT NULL,
	`subjectId` int NOT NULL,
	`countryCode` varchar(2) NOT NULL,
	`providerCode` varchar(64) NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`subtotalMinor` int NOT NULL,
	`feeMinor` int NOT NULL DEFAULT 0,
	`totalMinor` int NOT NULL,
	`recipientLabel` varchar(180) NOT NULL,
	`encryptedRecipientReference` text NOT NULL,
	`consentRecordedAt` timestamp NOT NULL,
	`state` enum('draft','awaiting_authorization','pending_provider','succeeded','failed','cancelled','expired') NOT NULL DEFAULT 'draft',
	`providerRequestId` varchar(180),
	`providerTransactionId` varchar(180),
	`expiresAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`failureCode` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymentIntents_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_intents_reference_unique` UNIQUE(`paymentReference`)
);
--> statement-breakpoint
CREATE TABLE `paymentProviderEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerCode` varchar(64) NOT NULL,
	`providerEventId` varchar(180) NOT NULL,
	`paymentIntentId` int,
	`eventType` varchar(120) NOT NULL,
	`verificationState` enum('pending','verified','rejected') NOT NULL DEFAULT 'pending',
	`redactedPayload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	CONSTRAINT `paymentProviderEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_provider_events_provider_event_unique` UNIQUE(`providerCode`,`providerEventId`)
);
--> statement-breakpoint
CREATE TABLE `paymentReceipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentIntentId` int NOT NULL,
	`receiptReference` varchar(48) NOT NULL,
	`issuedAt` timestamp NOT NULL,
	`amountMinor` int NOT NULL,
	`currencyCode` varchar(3) NOT NULL,
	`providerCode` varchar(64) NOT NULL,
	`providerTransactionId` varchar(180),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paymentReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_receipts_intent_unique` UNIQUE(`paymentIntentId`),
	CONSTRAINT `payment_receipts_reference_unique` UNIQUE(`receiptReference`)
);
--> statement-breakpoint
CREATE INDEX `payment_intents_payer_state_idx` ON `paymentIntents` (`payerUserId`,`state`);--> statement-breakpoint
CREATE INDEX `payment_intents_subject_idx` ON `paymentIntents` (`subjectType`,`subjectId`);--> statement-breakpoint
CREATE INDEX `payment_intents_provider_request_idx` ON `paymentIntents` (`providerCode`,`providerRequestId`);--> statement-breakpoint
CREATE INDEX `payment_provider_events_intent_idx` ON `paymentProviderEvents` (`paymentIntentId`,`createdAt`);