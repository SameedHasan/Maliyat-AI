CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`account_class` text NOT NULL,
	`currency` text NOT NULL,
	`institution` text,
	`last4` text,
	`credit_limit_minor` integer,
	`is_archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_user_idx` ON `accounts` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `categories_user_kind_idx` ON `categories` (`user_id`,`kind`,`sort_order`);--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`record_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text NOT NULL,
	`base_version` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outbox_status_idx` ON `outbox` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `outbox_record_idx` ON `outbox` (`record_id`,`entity`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transaction_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`transaction_id` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entries_transaction_idx` ON `transaction_entries` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `entries_account_idx` ON `transaction_entries` (`account_id`);--> statement-breakpoint
CREATE INDEX `entries_category_idx` ON `transaction_entries` (`category_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'cleared' NOT NULL,
	`occurred_on` text NOT NULL,
	`occurred_at` text,
	`payee` text,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_fingerprint` text,
	`refund_of_id` text,
	FOREIGN KEY (`refund_of_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transactions_list_idx` ON `transactions` (`user_id`,`occurred_on`,`id`) WHERE "transactions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `transactions_payee_idx` ON `transactions` (`payee`);--> statement-breakpoint
CREATE INDEX `transactions_fingerprint_idx` ON `transactions` (`source_fingerprint`);