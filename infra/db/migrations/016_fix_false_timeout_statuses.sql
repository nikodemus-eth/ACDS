-- Migration 016: Fix false execution statuses caused by premature 30s timeout
--
-- Root cause: ProviderExecutionProxy defaulted to 30s timeout, but Ollama local
-- inference takes 40-60+ seconds. ACDS aborted at 30s, marked executions "failed",
-- while the actual inference succeeded (Process Swarm fell back to direct Ollama).
--
-- Fix: Timeout increased to 120s in application code. This migration corrects
-- all records currently marked auto_reaped to 'succeeded' since the user
-- confirmed those Process Swarm runs completed successfully.

UPDATE execution_records
SET status = 'succeeded',
    error_message = 'Status corrected: originally auto_reaped due to 30s timeout, but linked Process Swarm run completed successfully'
WHERE status = 'auto_reaped';
