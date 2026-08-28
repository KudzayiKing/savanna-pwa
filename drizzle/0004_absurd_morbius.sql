CREATE TABLE `courseEnrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`learnerUserId` int NOT NULL,
	`enrollmentReference` varchar(36) NOT NULL,
	`amountPaidMinor` int NOT NULL DEFAULT 0,
	`currencyCode` varchar(3) NOT NULL,
	`accessState` enum('pending_payment','active','revoked','refunded') NOT NULL DEFAULT 'pending_payment',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`activatedAt` timestamp,
	`revokedAt` timestamp,
	CONSTRAINT `courseEnrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_enrollments_course_learner_unique` UNIQUE(`courseId`,`learnerUserId`),
	CONSTRAINT `course_enrollments_reference_unique` UNIQUE(`enrollmentReference`)
);
--> statement-breakpoint
CREATE TABLE `courseLessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`moduleId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`summary` varchar(1000),
	`videoStorageKey` varchar(512),
	`videoMimeType` varchar(120),
	`videoDurationSeconds` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isPreview` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courseLessons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courseModules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` varchar(1000),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courseModules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorUserId` int NOT NULL,
	`storefrontId` int,
	`slug` varchar(100) NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` varchar(2400),
	`category` varchar(100),
	`coverKey` varchar(512),
	`currencyCode` varchar(3) NOT NULL,
	`priceMinor` int NOT NULL,
	`visibility` enum('draft','public','paused') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courses_id` PRIMARY KEY(`id`),
	CONSTRAINT `courses_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `lessonProgress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enrollmentId` int NOT NULL,
	`lessonId` int NOT NULL,
	`watchedSeconds` int NOT NULL DEFAULT 0,
	`completedAt` timestamp,
	`lastViewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lessonProgress_id` PRIMARY KEY(`id`),
	CONSTRAINT `lesson_progress_enrollment_lesson_unique` UNIQUE(`enrollmentId`,`lessonId`)
);
--> statement-breakpoint
CREATE INDEX `course_enrollments_learner_state_idx` ON `courseEnrollments` (`learnerUserId`,`accessState`);--> statement-breakpoint
CREATE INDEX `course_lessons_module_sort_idx` ON `courseLessons` (`moduleId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `course_modules_course_sort_idx` ON `courseModules` (`courseId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `courses_creator_idx` ON `courses` (`creatorUserId`);--> statement-breakpoint
CREATE INDEX `courses_visibility_category_idx` ON `courses` (`visibility`,`category`);