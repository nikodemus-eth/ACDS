-- Migration 012: Align execution_records and provider_secrets with repository code
-- execution_records: original schema uses JSONB-packed routing_request/routing_decision columns.
-- Code expects flat columns (application, process, step, decision_posture, etc.).
-- provider_secrets: original schema uses ciphertext_blob/key_id/algorithm columns.
-- Code expects a single envelope JSONB column with UNIQUE on provider_id.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- execution_records: add missing flat columns
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS application VARCHAR;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS process VARCHAR;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS step VARCHAR;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS decision_posture VARCHAR;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS cognitive_grade VARCHAR;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS routing_decision_id VARCHAR;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS selected_model_profile_id VARCHAR;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS selected_tactic_profile_id VARCHAR;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS selected_provider_id VARCHAR;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS cost_estimate NUMERIC;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS normalized_output TEXT;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS fallback_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Migrate data from JSONB columns to flat columns (if JSONB columns exist and have data)
UPDATE execution_records
SET
  application = COALESCE(routing_request->>'application', application),
  process = COALESCE(routing_request->>'process', process),
  step = COALESCE(routing_request->>'step', step),
  decision_posture = COALESCE(routing_request->>'decisionPosture', decision_posture),
  cognitive_grade = COALESCE(routing_request->>'cognitiveGrade', cognitive_grade),
  routing_decision_id = COALESCE(routing_decision->>'id', routing_decision_id),
  selected_model_profile_id = COALESCE(
    routing_decision->>'selectedModelProfileId',
    model_profile_id::text,
    selected_model_profile_id
  ),
  selected_tactic_profile_id = COALESCE(
    routing_decision->>'selectedTacticProfileId',
    tactic_profile_id::text,
    selected_tactic_profile_id
  ),
  selected_provider_id = COALESCE(
    routing_decision->>'selectedProviderId',
    provider_id::text,
    selected_provider_id
  ),
  normalized_output = COALESCE(output_payload->>'result', normalized_output),
  error_message = COALESCE(error_details->>'message', error_message)
WHERE routing_request IS NOT NULL OR routing_decision IS NOT NULL;

-- Set defaults for NOT NULL columns on any rows that still have NULLs
UPDATE execution_records SET application = '' WHERE application IS NULL;
UPDATE execution_records SET process = '' WHERE process IS NULL;
UPDATE execution_records SET step = '' WHERE step IS NULL;
UPDATE execution_records SET decision_posture = 'standard' WHERE decision_posture IS NULL;
UPDATE execution_records SET cognitive_grade = 'C' WHERE cognitive_grade IS NULL;
UPDATE execution_records SET routing_decision_id = id::text WHERE routing_decision_id IS NULL;
UPDATE execution_records SET selected_model_profile_id = COALESCE(model_profile_id::text, '') WHERE selected_model_profile_id IS NULL;
UPDATE execution_records SET selected_tactic_profile_id = COALESCE(tactic_profile_id::text, '') WHERE selected_tactic_profile_id IS NULL;
UPDATE execution_records SET selected_provider_id = COALESCE(provider_id::text, '') WHERE selected_provider_id IS NULL;

-- Now set NOT NULL constraints on required columns
ALTER TABLE execution_records ALTER COLUMN application SET NOT NULL;
ALTER TABLE execution_records ALTER COLUMN process SET NOT NULL;
ALTER TABLE execution_records ALTER COLUMN step SET NOT NULL;
ALTER TABLE execution_records ALTER COLUMN decision_posture SET NOT NULL;
ALTER TABLE execution_records ALTER COLUMN cognitive_grade SET NOT NULL;
ALTER TABLE execution_records ALTER COLUMN routing_decision_id SET NOT NULL;
ALTER TABLE execution_records ALTER COLUMN selected_model_profile_id SET NOT NULL;
ALTER TABLE execution_records ALTER COLUMN selected_tactic_profile_id SET NOT NULL;
ALTER TABLE execution_records ALTER COLUMN selected_provider_id SET NOT NULL;

-- Add composite index for family lookups
CREATE INDEX IF NOT EXISTS idx_execution_records_family
  ON execution_records(application, process, step);

-- ═══════════════════════════════════════════════════════════════════════════════
-- provider_secrets: add envelope column, UNIQUE constraint
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE provider_secrets ADD COLUMN IF NOT EXISTS envelope JSONB;
ALTER TABLE provider_secrets ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Migrate old ciphertext_blob/key_id/algorithm into envelope JSONB
UPDATE provider_secrets
SET envelope = jsonb_build_object(
  'ciphertext', ciphertext_blob,
  'keyId', key_id,
  'algorithm', COALESCE(algorithm, 'aes-256-gcm')
)
WHERE envelope IS NULL AND ciphertext_blob IS NOT NULL;

-- Add UNIQUE constraint on provider_id (required for ON CONFLICT)
-- First check if it already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'provider_secrets_provider_id_unique'
  ) THEN
    ALTER TABLE provider_secrets ADD CONSTRAINT provider_secrets_provider_id_unique UNIQUE (provider_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Apply migration 009: plateau_signals (if not yet applied)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plateau_signals (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    family_key                  TEXT        NOT NULL,
    detected                    BOOLEAN     NOT NULL DEFAULT FALSE,
    severity                    TEXT        NOT NULL DEFAULT 'none'
        CHECK (severity IN ('none', 'mild', 'moderate', 'severe')),
    flat_quality                BOOLEAN     NOT NULL DEFAULT FALSE,
    rising_cost                 BOOLEAN     NOT NULL DEFAULT FALSE,
    rising_correction_burden    BOOLEAN     NOT NULL DEFAULT FALSE,
    repeated_fallbacks          BOOLEAN     NOT NULL DEFAULT FALSE,
    persistent_underperformance BOOLEAN     NOT NULL DEFAULT FALSE,
    detected_at                 TEXT        NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plateau_signals_family
    ON plateau_signals (family_key);

CREATE INDEX IF NOT EXISTS idx_plateau_signals_detected
    ON plateau_signals (detected, created_at DESC)
    WHERE detected = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Apply migration 010: scored_at on execution_records (if not yet applied)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE execution_records ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_execution_records_unscored
    ON execution_records (created_at DESC)
    WHERE scored_at IS NULL AND status = 'succeeded';

COMMIT;
