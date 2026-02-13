-- Migration 011: P5 auth prep + fix directive_id type
-- directive_id was UUID but directive IDs are text strings like "DIR-xxx"

ALTER TABLE decisions_log ALTER COLUMN directive_id TYPE TEXT USING directive_id::text;
