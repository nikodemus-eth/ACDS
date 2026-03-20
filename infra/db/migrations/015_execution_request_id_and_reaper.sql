-- Migration 015: Add request_id to execution_records and update status enum
--
-- 1. Adds request_id column to link ACDS executions to Process Swarm runs
-- 2. Updates the status CHECK constraint to allow 'auto_reaped' status
-- 3. Indexes request_id for fast lookup by run ID

-- Add request_id column
ALTER TABLE execution_records
  ADD COLUMN IF NOT EXISTS request_id TEXT;

-- Create index for Process Swarm run linkage
CREATE INDEX IF NOT EXISTS idx_execution_records_request_id
  ON execution_records (request_id)
  WHERE request_id IS NOT NULL;

-- Drop the old status check constraint if it exists, then recreate with auto_reaped
DO $$
BEGIN
  -- Try to drop the old constraint (may not exist on all installations)
  ALTER TABLE execution_records DROP CONSTRAINT IF EXISTS execution_records_status_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE execution_records
  ADD CONSTRAINT execution_records_status_check
  CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'fallback_succeeded', 'fallback_failed', 'auto_reaped'));

-- Auto-reap any currently stuck executions older than 1 hour
UPDATE execution_records
SET status = 'auto_reaped',
    error_message = 'Stale execution reaped during migration 015',
    completed_at = NOW()
WHERE status IN ('pending', 'running')
  AND created_at < NOW() - INTERVAL '1 hour';
