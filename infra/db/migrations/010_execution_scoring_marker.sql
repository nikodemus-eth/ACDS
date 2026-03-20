-- Migration 010: Add scored_at column to execution_records
-- Used by the execution scoring worker to track which records have been scored.

BEGIN;

ALTER TABLE execution_records
    ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

CREATE INDEX idx_execution_records_unscored
    ON execution_records (created_at DESC)
    WHERE scored_at IS NULL AND status = 'succeeded';

COMMIT;
