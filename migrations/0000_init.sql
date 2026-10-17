CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attribute_translations` (
	`attribute_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	PRIMARY KEY(`attribute_id`, `locale`),
	FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attribute_translations_locale_check" CHECK("attribute_translations"."locale" IN ('ja', 'en', 'es'))
);
--> statement-breakpoint
CREATE TABLE `attributes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "attributes_status_check" CHECK("attributes"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attributes_slug_unique` ON `attributes` (`slug`);--> statement-breakpoint
CREATE TABLE `countries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `countries_slug_unique` ON `countries` (`slug`);--> statement-breakpoint
CREATE TABLE `country_translations` (
	`country_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`country_id`, `locale`),
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "country_translations_locale_check" CHECK("country_translations"."locale" IN ('ja', 'en', 'es'))
);
--> statement-breakpoint
CREATE TABLE `destination_attributes` (
	`destination_id` integer NOT NULL,
	`attribute_id` integer NOT NULL,
	`score` integer NOT NULL,
	PRIMARY KEY(`destination_id`, `attribute_id`),
	FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "destination_attributes_score_check" CHECK("destination_attributes"."score" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE `destination_translations` (
	`destination_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`highlights_json` text DEFAULT '[]' NOT NULL,
	`cautions` text,
	`best_season_text` text,
	`cost_basis` text,
	`image_alt` text,
	PRIMARY KEY(`destination_id`, `locale`),
	FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "destination_translations_locale_check" CHECK("destination_translations"."locale" IN ('ja', 'en', 'es'))
);
--> statement-breakpoint
CREATE TABLE `destinations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`country_id` integer NOT NULL,
	`destination_type` text NOT NULL,
	`recommended_days_min` integer,
	`recommended_days_max` integer,
	`cost_min` integer,
	`cost_max` integer,
	`cost_currency` text,
	`cost_scope` text,
	`cost_source_name` text,
	`cost_source_url` text,
	`cost_updated_at` text,
	`image_url` text,
	`image_attribution` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "destinations_status_check" CHECK("destinations"."status" IN ('draft', 'published', 'archived')),
	CONSTRAINT "destinations_type_check" CHECK("destinations"."destination_type" IN ('city', 'region', 'island', 'other')),
	CONSTRAINT "destinations_days_check" CHECK(("destinations"."recommended_days_min" IS NULL OR "destinations"."recommended_days_min" >= 1)
        AND ("destinations"."recommended_days_max" IS NULL OR "destinations"."recommended_days_max" >= 1)
        AND ("destinations"."recommended_days_min" IS NULL OR "destinations"."recommended_days_max" IS NULL
          OR "destinations"."recommended_days_min" <= "destinations"."recommended_days_max")),
	CONSTRAINT "destinations_cost_check" CHECK(("destinations"."cost_min" IS NULL AND "destinations"."cost_max" IS NULL AND "destinations"."cost_currency" IS NULL
          AND "destinations"."cost_scope" IS NULL AND "destinations"."cost_source_name" IS NULL
          AND "destinations"."cost_source_url" IS NULL AND "destinations"."cost_updated_at" IS NULL)
        OR ("destinations"."cost_min" IS NOT NULL AND "destinations"."cost_max" IS NOT NULL
          AND "destinations"."cost_currency" IS NOT NULL AND "destinations"."cost_scope" IS NOT NULL
          AND "destinations"."cost_source_name" IS NOT NULL AND "destinations"."cost_updated_at" IS NOT NULL
          AND "destinations"."cost_min" >= 0 AND "destinations"."cost_min" <= "destinations"."cost_max"
          AND "destinations"."cost_scope" IN ('per_person_excluding_international_flights', 'per_person_including_international_flights')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `destinations_slug_unique` ON `destinations` (`slug`);--> statement-breakpoint
CREATE INDEX `destinations_status_idx` ON `destinations` (`status`);--> statement-breakpoint
CREATE INDEX `destinations_country_idx` ON `destinations` (`country_id`);--> statement-breakpoint
CREATE TABLE `option_score_effects` (
	`option_id` integer NOT NULL,
	`attribute_id` integer NOT NULL,
	`weight` integer NOT NULL,
	PRIMARY KEY(`option_id`, `attribute_id`),
	FOREIGN KEY (`option_id`) REFERENCES `question_options`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "option_score_effects_weight_check" CHECK("option_score_effects"."weight" BETWEEN -5 AND 5 AND "option_score_effects"."weight" <> 0)
);
--> statement-breakpoint
CREATE TABLE `question_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "question_categories_status_check" CHECK("question_categories"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_categories_slug_unique` ON `question_categories` (`slug`);--> statement-breakpoint
CREATE TABLE `question_category_translations` (
	`category_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`category_id`, `locale`),
	FOREIGN KEY (`category_id`) REFERENCES `question_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "question_category_translations_locale_check" CHECK("question_category_translations"."locale" IN ('ja', 'en', 'es'))
);
--> statement-breakpoint
CREATE TABLE `question_option_translations` (
	`option_id` integer NOT NULL,
	`locale` text NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`option_id`, `locale`),
	FOREIGN KEY (`option_id`) REFERENCES `question_options`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "question_option_translations_locale_check" CHECK("question_option_translations"."locale" IN ('ja', 'en', 'es'))
);
--> statement-breakpoint
CREATE TABLE `question_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_id` integer NOT NULL,
	`value` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "question_options_status_check" CHECK("question_options"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `question_options_question_idx` ON `question_options` (`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `question_options_question_value_unique` ON `question_options` (`question_id`,`value`);--> statement-breakpoint
CREATE TABLE `question_translations` (
	`question_id` integer NOT NULL,
	`locale` text NOT NULL,
	`prompt` text NOT NULL,
	`description` text,
	PRIMARY KEY(`question_id`, `locale`),
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "question_translations_locale_check" CHECK("question_translations"."locale" IN ('ja', 'en', 'es'))
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`category_id` integer NOT NULL,
	`question_type` text NOT NULL,
	`priority_weight` integer DEFAULT 5 NOT NULL,
	`display_order` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `question_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "questions_status_check" CHECK("questions"."status" IN ('draft', 'published', 'archived')),
	CONSTRAINT "questions_type_check" CHECK("questions"."question_type" IN ('single_choice', 'multiple_choice')),
	CONSTRAINT "questions_priority_check" CHECK("questions"."priority_weight" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_slug_unique` ON `questions` (`slug`);--> statement-breakpoint
CREATE INDEX `questions_status_idx` ON `questions` (`status`);--> statement-breakpoint
CREATE INDEX `questions_category_idx` ON `questions` (`category_id`);