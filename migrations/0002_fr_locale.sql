-- Phase 17: accept `fr` in the locale CHECK constraint of every translation table
-- (docs/working/DECISIONS.md ADR-032). SQLite cannot alter a CHECK constraint, so
-- each table is rebuilt and its rows copied. Hand-edited from drizzle-kit output:
-- the PRAGMA foreign_keys statements were removed because D1 enforces foreign
-- keys while applying migrations (see 0001). They are not needed: no table
-- references a translation table, so dropping one cascades nowhere, and the
-- copied rows keep valid parents.
CREATE TABLE `__new_attribute_translations` (
	`attribute_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	PRIMARY KEY(`attribute_id`, `locale`),
	FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attribute_translations_locale_check" CHECK("__new_attribute_translations"."locale" IN ('ja', 'en', 'es', 'fr'))
);
--> statement-breakpoint
INSERT INTO `__new_attribute_translations`("attribute_id", "locale", "name", "description") SELECT "attribute_id", "locale", "name", "description" FROM `attribute_translations`;--> statement-breakpoint
DROP TABLE `attribute_translations`;--> statement-breakpoint
ALTER TABLE `__new_attribute_translations` RENAME TO `attribute_translations`;--> statement-breakpoint
CREATE TABLE `__new_country_translations` (
	`country_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`country_id`, `locale`),
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "country_translations_locale_check" CHECK("__new_country_translations"."locale" IN ('ja', 'en', 'es', 'fr'))
);
--> statement-breakpoint
INSERT INTO `__new_country_translations`("country_id", "locale", "name") SELECT "country_id", "locale", "name" FROM `country_translations`;--> statement-breakpoint
DROP TABLE `country_translations`;--> statement-breakpoint
ALTER TABLE `__new_country_translations` RENAME TO `country_translations`;--> statement-breakpoint
CREATE TABLE `__new_destination_cost_estimate_translations` (
	`estimate_id` integer NOT NULL,
	`locale` text NOT NULL,
	`basis` text NOT NULL,
	PRIMARY KEY(`estimate_id`, `locale`),
	FOREIGN KEY (`estimate_id`) REFERENCES `destination_cost_estimates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "destination_cost_estimate_translations_locale_check" CHECK("__new_destination_cost_estimate_translations"."locale" IN ('ja', 'en', 'es', 'fr'))
);
--> statement-breakpoint
INSERT INTO `__new_destination_cost_estimate_translations`("estimate_id", "locale", "basis") SELECT "estimate_id", "locale", "basis" FROM `destination_cost_estimate_translations`;--> statement-breakpoint
DROP TABLE `destination_cost_estimate_translations`;--> statement-breakpoint
ALTER TABLE `__new_destination_cost_estimate_translations` RENAME TO `destination_cost_estimate_translations`;--> statement-breakpoint
CREATE TABLE `__new_destination_translations` (
	`destination_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`highlights_json` text DEFAULT '[]' NOT NULL,
	`cautions` text,
	`best_season_text` text,
	`image_alt` text,
	PRIMARY KEY(`destination_id`, `locale`),
	FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "destination_translations_locale_check" CHECK("__new_destination_translations"."locale" IN ('ja', 'en', 'es', 'fr'))
);
--> statement-breakpoint
INSERT INTO `__new_destination_translations`("destination_id", "locale", "name", "summary", "highlights_json", "cautions", "best_season_text", "image_alt") SELECT "destination_id", "locale", "name", "summary", "highlights_json", "cautions", "best_season_text", "image_alt" FROM `destination_translations`;--> statement-breakpoint
DROP TABLE `destination_translations`;--> statement-breakpoint
ALTER TABLE `__new_destination_translations` RENAME TO `destination_translations`;--> statement-breakpoint
CREATE TABLE `__new_question_category_translations` (
	`category_id` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`category_id`, `locale`),
	FOREIGN KEY (`category_id`) REFERENCES `question_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "question_category_translations_locale_check" CHECK("__new_question_category_translations"."locale" IN ('ja', 'en', 'es', 'fr'))
);
--> statement-breakpoint
INSERT INTO `__new_question_category_translations`("category_id", "locale", "name") SELECT "category_id", "locale", "name" FROM `question_category_translations`;--> statement-breakpoint
DROP TABLE `question_category_translations`;--> statement-breakpoint
ALTER TABLE `__new_question_category_translations` RENAME TO `question_category_translations`;--> statement-breakpoint
CREATE TABLE `__new_question_option_translations` (
	`option_id` integer NOT NULL,
	`locale` text NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`option_id`, `locale`),
	FOREIGN KEY (`option_id`) REFERENCES `question_options`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "question_option_translations_locale_check" CHECK("__new_question_option_translations"."locale" IN ('ja', 'en', 'es', 'fr'))
);
--> statement-breakpoint
INSERT INTO `__new_question_option_translations`("option_id", "locale", "label") SELECT "option_id", "locale", "label" FROM `question_option_translations`;--> statement-breakpoint
DROP TABLE `question_option_translations`;--> statement-breakpoint
ALTER TABLE `__new_question_option_translations` RENAME TO `question_option_translations`;--> statement-breakpoint
CREATE TABLE `__new_question_translations` (
	`question_id` integer NOT NULL,
	`locale` text NOT NULL,
	`prompt` text NOT NULL,
	`description` text,
	PRIMARY KEY(`question_id`, `locale`),
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "question_translations_locale_check" CHECK("__new_question_translations"."locale" IN ('ja', 'en', 'es', 'fr'))
);
--> statement-breakpoint
INSERT INTO `__new_question_translations`("question_id", "locale", "prompt", "description") SELECT "question_id", "locale", "prompt", "description" FROM `question_translations`;--> statement-breakpoint
DROP TABLE `question_translations`;--> statement-breakpoint
ALTER TABLE `__new_question_translations` RENAME TO `question_translations`;