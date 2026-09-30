CREATE TABLE `budget_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`budget_id` text NOT NULL,
	`category_id` text NOT NULL,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `budget_categories_budget_idx` ON `budget_categories` (`budget_id`);--> statement-breakpoint
CREATE INDEX `budget_categories_category_idx` ON `budget_categories` (`category_id`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`period` text NOT NULL,
	`start_on` text NOT NULL,
	`end_on` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`rollover` integer DEFAULT false NOT NULL,
	`alert_thresholds` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budgets_user_idx` ON `budgets` (`user_id`);