-- Migration 014: Make legacy JSONB columns nullable on execution_records
-- Migration 012 moved execution_records to flat columns (application, process, step, etc.)
-- but left routing_request and routing_decision as NOT NULL, causing inserts to fail
-- since the repository code only populates the flat columns.

BEGIN;

ALTER TABLE execution_records ALTER COLUMN routing_request DROP NOT NULL;
ALTER TABLE execution_records ALTER COLUMN routing_decision DROP NOT NULL;

COMMIT;
