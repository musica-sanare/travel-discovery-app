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
