# Data Model — Travel Discovery

This is the initial logical model. Claude Code should convert it into a concrete schema, constraints, indexes, and migrations after checking current D1/ORM compatibility.

Localization rule: base tables hold only locale-neutral data (IDs, slugs, enums, numbers, URLs, dates). Every user-visible string lives in a `*_translations` table keyed by `(entity_id, locale)` with `locale` in `ja` / `en` / `es`. The missing-translation fallback is defined in `docs/DECISIONS.md` (ADR-012).

## Entities

### countries
- `id`: stable primary key
- `slug`: unique stable slug
- `created_at`, `updated_at`

### country_translations
- `country_id`
- `locale`: `ja` / `en` / `es`
- `name`
- composite primary key `(country_id, locale)`

### destinations
- `id`: stable primary key
- `slug`: unique stable slug
- `country_id`: foreign key
- `destination_type`: city / region / island / other supported enum
- `recommended_days_min`, `recommended_days_max`
- `cost_min`, `cost_max`, `cost_currency`
- `cost_scope`: stable enum, e.g. `per_person_excluding_international_flights`; its label is localized in UI message catalogs
- `cost_source_name`, `cost_source_url`
- `cost_updated_at`
- `image_url`, `image_attribution`
- `flight_search_config` / `hotel_search_config` only if safe, documented, and necessary; otherwise generate known safe URLs in application code
- `status`: draft / published / archived
- `created_at`, `updated_at`

### destination_translations
- `destination_id`
- `locale`: `ja` / `en` / `es`
- `name`
- `summary`
- `highlights` (normalized child table or validated JSON, decision documented)
- `cautions`
- `best_season_text`
- `cost_basis`: explanation of what the estimate includes and its assumptions
- `image_alt`
- composite primary key `(destination_id, locale)`

### attributes
- `id`
- `slug`: unique
- `status`

### attribute_translations
- `attribute_id`
- `locale`: `ja` / `en` / `es`
- `name`
- `description` (optional)
- composite primary key `(attribute_id, locale)`

### destination_attributes
- `destination_id`
- `attribute_id`
- `score`: initial scale 0–5
- composite primary key `(destination_id, attribute_id)`

### questions
- `id`
- `slug`: unique
- `category_id` or category slug/reference
- `question_type`: single_choice / multiple_choice / range
- `priority_weight`
- `status`: draft / published / archived
- `selection_tags` or explicit conditions (small, validated rule set only)
- `display_order` (optional)
- `created_at`, `updated_at`

### question_translations
- `question_id`
- `locale`: `ja` / `en` / `es`
- `prompt`
- `description` (optional)
- composite primary key `(question_id, locale)`

### question_categories
- `id`
- `slug`: unique
- `status`

### question_category_translations
- `category_id`
- `locale`: `ja` / `en` / `es`
- `name`
- composite primary key `(category_id, locale)`

### question_option_translations
- `option_id`
- `locale`: `ja` / `en` / `es`
- `label`
- composite primary key `(option_id, locale)`

### question_options
- `id`
- `question_id`
- `value`
- `display_order`
- `status`

### option_score_effects
- `option_id`
- `attribute_id`
- `weight`: signed numeric effect, range documented and validated
- composite primary key `(option_id, attribute_id)`

### app_settings
- `key`
- `value_json`
- `updated_at`
- `updated_by` only if a verified admin identity is available and needed

## Relationships
- One country has many destinations.
- One destination belongs to one country.
- Destinations and attributes are many-to-many through `destination_attributes`.
- Localized text is stored separately from stable IDs and scoring data.
- One question has many options.
- Options and attributes are many-to-many through `option_score_effects`.
- Questions belong to a category.
- Global settings are key/value configuration with schema validation per key.

## Design rules
- Prefer soft archival over hard deletion for records referenced elsewhere.
- Add foreign keys and indexes for public listing, status, slugs, and joins.
- Validate ranges and relationships at the API boundary and, where practical, with DB constraints.
- Keep timestamps in a consistent format (UTC ISO 8601 at API boundaries; choose a compatible DB storage convention).
- Avoid storing user answers in persistent tables for MVP.
- Do not store arbitrary executable expressions or JavaScript in question conditions. Use a small, typed condition format.
- If JSON fields are chosen, document the tradeoff and validate them at runtime.
- Require curated `ja`, `en`, and `es` translations for all published seeded content; enforce a documented fallback for incomplete admin-entered content.
- Store money as integer minor units or clearly defined integer units; never mix currencies without explicit conversion metadata.
- Cost records must include scope, basis, source, and update date.
- External links must be generated safely and validated against an allowlist or fixed templates.

## Seed data
Create enough sample content to demonstrate the experience, but avoid unsupported factual precision. Use approximately 30–50 destinations and 30–50 questions only if the quality and provenance can be maintained. It is acceptable to start with a smaller curated dataset and grow it later.

Each seeded destination must include a source/basis for indicative costs or explicitly label the cost as illustrative and unverified. Never present seed values as current live prices.

## Phase 1 schema notes

The concrete schema is `server/db/schema.ts` (Drizzle ORM 0.45) and the generated migration in `migrations/`. Adjustments to the logical model above, with reasons:

- **IDs and timestamps**: integer autoincrement primary keys (internal; the public API uses slugs only). `created_at` / `updated_at` are UTC ISO 8601 text written by the application; `cost_updated_at` is an ISO date (`YYYY-MM-DD`).
- **Status values**: destinations and questions use `draft / published / archived`; attributes, question categories, and question options use `active / archived`. Countries have no status (they are reference data and are never deleted). CHECK constraints enforce the allowed values.
- **Translations**: `country_translations`, `attribute_translations`, and `question_category_translations` were added so every user-visible string is localized (see the localization rule above). `locale` is constrained to `ja`, `en`, `es`.
- **Highlights**: stored as a validated JSON array of strings (`destination_translations.highlights_json`, max 8 items of 200 characters) instead of a child table. Tradeoff: simpler writes and reads for a short ordered list; validated with Zod on write and read.
- **Indicative cost**: `cost_min` / `cost_max` are integers in whole units of `cost_currency` (ISO 4217 code); indicative ranges do not need sub-unit precision. A CHECK constraint makes the cost group all-or-nothing (min, max, currency, scope, source name, updated date; source URL optional) with `0 <= cost_min <= cost_max`. When a cost is set, every provided translation must include `cost_basis` (API validation). `cost_scope` is a stable enum whose label is localized in the UI.
- **Images**: `image_url` and `image_attribution` on the destination; `image_alt` per translation (required for each provided translation when an image is set). URLs must be `https`.
- **Scales**: `destination_attributes.score` is an integer 0–5. `option_score_effects.weight` is a non-zero integer from −5 to 5 (initial range; Phase 2 may refine it when the scoring formula is documented). `questions.priority_weight` is an integer 1–10 (default 5).
- **Question types**: only `single_choice` and `multiple_choice` are implemented, and `multiple_choice` cannot be published until Phase 2 defines its scoring (`docs/DECISIONS.md` ADR-020). `range` from the logical model is deferred: it needs bounds and scoring semantics that Phase 2 defines (SPEC §4 limits sliders to clearly bounded values such as budget). Adding it later is a migration that extends the CHECK constraint.
- **Selection conditions**: `selection_tags` / explicit conditions are deferred to Phase 2, when the question-selection algorithm and its rule format are documented.
- **Options**: unique per question by `value` (stable slug), so updates match options by value. Options omitted from an admin update are archived, not deleted.
- **Settings**: `app_settings` stores the `quiz` key (validated JSON); see `docs/DECISIONS.md` ADR-020.
- **Deletion**: no hard deletes through the API. Foreign keys use `ON DELETE CASCADE` only from parent rows to their translations/child rows and `RESTRICT` for references between independent entities.
