CREATE TABLE `carousel_image` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`filename` text NOT NULL,
	`url` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_cover` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `carousel_post`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `carousel_post` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text,
	`description` text,
	`post_mode` text DEFAULT 'MEDIA_UPLOAD' NOT NULL,
	`publish_id` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`fail_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`client_key` text,
	`client_secret` text,
	`public_base_url` text,
	`updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE `tiktok_account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`open_id` text NOT NULL,
	`username` text,
	`display_name` text,
	`avatar_url` text,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`access_token_expires_at` integer NOT NULL,
	`refresh_token_expires_at` integer NOT NULL,
	`scope` text,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tiktok_account_open_id_unique` ON `tiktok_account` (`open_id`);