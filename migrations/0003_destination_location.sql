-- Phase 20: optional representative point of a destination (docs/working/DECISIONS.md
-- ADR-036, docs/en/DATA_MODEL.md "destinations"). Additive: code deployed before this
-- migration does not read the columns, so it keeps working once they exist.
ALTER TABLE `destinations` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `destinations` ADD `longitude` real;
