-- Phase 2: cost estimates per currency and structured best months
-- (docs/working/DECISIONS.md ADR-021, docs/en/DATA_MODEL.md "Phase 2 schema notes").
-- Hand-edited from drizzle-kit output. D1 enforces foreign keys while applying
-- migrations, so dropping the old `destinations` table can cascade-delete its
-- translations and attribute scores. They are copied to backup tables first
-- and restored after the rebuild; the restore clears the child tables before
-- inserting so it is correct whether or not the cascade happened.
-- Legacy single-currency cost columns are discarded.
CREATE TABLE `__backup_destination_translations` AS SELECT `destination_id`, `locale`, `name`, `summary`, `highlights_json`, `cautions`, `best_season_text`, `image_alt` FROM `destination_translations`;--> statement-breakpoint
CREATE TABLE `__backup_destination_attributes` AS SELECT `destination_id`, `attribute_id`, `score` FROM `destination_attributes`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_destinations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`country_id` integer NOT NULL,
	`destination_type` text NOT NULL,
	`recommended_days_min` integer,
	`recommended_days_max` integer,
	`best_months_mask` integer,
	`image_url` text,
	`image_attribution` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "destinations_status_check" CHECK("__new_destinations"."status" IN ('draft', 'published', 'archived')),
	CONSTRAINT "destinations_type_check" CHECK("__new_destinations"."destination_type" IN ('city', 'region', 'island', 'other')),
	CONSTRAINT "destinations_days_check" CHECK(("__new_destinations"."recommended_days_min" IS NULL OR "__new_destinations"."recommended_days_min" >= 1)
        AND ("__new_destinations"."recommended_days_max" IS NULL OR "__new_destinations"."recommended_days_max" >= 1)
        AND ("__new_destinations"."recommended_days_min" IS NULL OR "__new_destinations"."recommended_days_max" IS NULL
          OR "__new_destinations"."recommended_days_min" <= "__new_destinations"."recommended_days_max")),
	CONSTRAINT "destinations_best_months_check" CHECK("__new_destinations"."best_months_mask" IS NULL OR "__new_destinations"."best_months_mask" BETWEEN 1 AND 4095)
);
--> statement-breakpoint
INSERT INTO `__new_destinations`("id", "slug", "country_id", "destination_type", "recommended_days_min", "recommended_days_max", "image_url", "image_attribution", "status", "created_at", "updated_at") SELECT "id", "slug", "country_id", "destination_type", "recommended_days_min", "recommended_days_max", "image_url", "image_attribution", "status", "created_at", "updated_at" FROM `destinations`;--> statement-breakpoint
DROP TABLE `destinations`;--> statement-breakpoint
ALTER TABLE `__new_destinations` RENAME TO `destinations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `destinations_slug_unique` ON `destinations` (`slug`);--> statement-breakpoint
CREATE INDEX `destinations_status_idx` ON `destinations` (`status`);--> statement-breakpoint
CREATE INDEX `destinations_country_idx` ON `destinations` (`country_id`);--> statement-breakpoint
ALTER TABLE `destination_translations` DROP COLUMN `cost_basis`;--> statement-breakpoint
DELETE FROM `destination_translations`;--> statement-breakpoint
INSERT INTO `destination_translations` (`destination_id`, `locale`, `name`, `summary`, `highlights_json`, `cautions`, `best_season_text`, `image_alt`) SELECT `destination_id`, `locale`, `name`, `summary`, `highlights_json`, `cautions`, `best_season_text`, `image_alt` FROM `__backup_destination_translations`;--> statement-breakpoint
DELETE FROM `destination_attributes`;--> statement-breakpoint
INSERT INTO `destination_attributes` (`destination_id`, `attribute_id`, `score`) SELECT `destination_id`, `attribute_id`, `score` FROM `__backup_destination_attributes`;--> statement-breakpoint
DROP TABLE `__backup_destination_translations`;--> statement-breakpoint
DROP TABLE `__backup_destination_attributes`;--> statement-breakpoint
CREATE TABLE `destination_cost_estimate_translations` (
	`estimate_id` integer NOT NULL,
	`locale` text NOT NULL,
	`basis` text NOT NULL,
	PRIMARY KEY(`estimate_id`, `locale`),
	FOREIGN KEY (`estimate_id`) REFERENCES `destination_cost_estimates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "destination_cost_estimate_translations_locale_check" CHECK("destination_cost_estimate_translations"."locale" IN ('ja', 'en', 'es'))
);
--> statement-breakpoint
CREATE TABLE `destination_cost_estimates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`destination_id` integer NOT NULL,
	`currency` text NOT NULL,
	`period` text NOT NULL,
	`scope` text NOT NULL,
	`min` integer NOT NULL,
	`max` integer NOT NULL,
	`source_name` text NOT NULL,
	`source_url` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "destination_cost_estimates_currency_check" CHECK("destination_cost_estimates"."currency" IN ('JPY', 'USD', 'EUR')),
	CONSTRAINT "destination_cost_estimates_period_check" CHECK("destination_cost_estimates"."period" IN ('per_day', 'per_trip')),
	CONSTRAINT "destination_cost_estimates_scope_check" CHECK("destination_cost_estimates"."scope" IN ('per_person_excluding_international_flights', 'per_person_including_international_flights')),
	CONSTRAINT "destination_cost_estimates_range_check" CHECK("destination_cost_estimates"."min" >= 0 AND "destination_cost_estimates"."min" <= "destination_cost_estimates"."max")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `destination_cost_estimates_destination_currency_unique` ON `destination_cost_estimates` (`destination_id`,`currency`);--> statement-breakpoint
