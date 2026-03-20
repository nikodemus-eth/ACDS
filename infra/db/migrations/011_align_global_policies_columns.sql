-- Migration 011: Align policy table columns with repository code
-- The original tables were created with abbreviated/JSONB-packed column names.
-- The migration file (004) was later rewritten with individual columns,
-- but the live database still has the originals. This migration reconciles them.

BEGIN;

-- ─── global_policies ──────────────────────────────────────────────────────────
-- Rename abbreviated columns to match code expectations
ALTER TABLE global_policies RENAME COLUMN cost_sensitivity TO default_cost_sensitivity;
ALTER TABLE global_policies RENAME COLUMN max_latency_by_load_tier TO max_latency_ms_by_load_tier;
ALTER TABLE global_policies RENAME COLUMN structured_output_by_grade TO structured_output_required_for_grades;
ALTER TABLE global_policies RENAME COLUMN traceability_by_grade TO traceability_required_for_grades;

-- Add missing columns
ALTER TABLE global_policies ADD COLUMN IF NOT EXISTS local_preferred_task_types JSONB;
ALTER TABLE global_policies ADD COLUMN IF NOT EXISTS cloud_required_load_tiers JSONB;
ALTER TABLE global_policies ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

-- ─── application_policies ─────────────────────────────────────────────────────
-- Original schema had a single `overrides` JSONB column. Code expects individual columns.
ALTER TABLE application_policies ADD COLUMN IF NOT EXISTS allowed_vendors JSONB;
ALTER TABLE application_policies ADD COLUMN IF NOT EXISTS blocked_vendors JSONB;
ALTER TABLE application_policies ADD COLUMN IF NOT EXISTS privacy_override VARCHAR;
ALTER TABLE application_policies ADD COLUMN IF NOT EXISTS cost_sensitivity_override VARCHAR;
ALTER TABLE application_policies ADD COLUMN IF NOT EXISTS preferred_model_profile_ids JSONB;
ALTER TABLE application_policies ADD COLUMN IF NOT EXISTS blocked_model_profile_ids JSONB;
ALTER TABLE application_policies ADD COLUMN IF NOT EXISTS local_preferred_task_types JSONB;
ALTER TABLE application_policies ADD COLUMN IF NOT EXISTS structured_output_required_for_grades JSONB;
ALTER TABLE application_policies ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

-- Migrate data from overrides JSONB to individual columns (if overrides exists and has data)
UPDATE application_policies
SET
  allowed_vendors = COALESCE(overrides->'allowedVendors', allowed_vendors::jsonb),
  blocked_vendors = COALESCE(overrides->'blockedVendors', blocked_vendors::jsonb),
  privacy_override = COALESCE(overrides->>'privacyOverride', privacy_override),
  cost_sensitivity_override = COALESCE(overrides->>'costSensitivityOverride', cost_sensitivity_override),
  preferred_model_profile_ids = COALESCE(overrides->'preferredModelProfileIds', preferred_model_profile_ids::jsonb),
  blocked_model_profile_ids = COALESCE(overrides->'blockedModelProfileIds', blocked_model_profile_ids::jsonb),
  local_preferred_task_types = COALESCE(overrides->'localPreferredTaskTypes', local_preferred_task_types::jsonb),
  structured_output_required_for_grades = COALESCE(overrides->'structuredOutputRequiredForGrades', structured_output_required_for_grades::jsonb),
  enabled = COALESCE((overrides->>'enabled')::boolean, enabled)
WHERE overrides IS NOT NULL AND overrides != '{}'::jsonb;

-- Drop the old overrides column
ALTER TABLE application_policies ALTER COLUMN overrides DROP NOT NULL;

-- ─── process_policies ─────────────────────────────────────────────────────────
-- Original schema had a single `overrides` JSONB column. Code expects individual columns.
ALTER TABLE process_policies ADD COLUMN IF NOT EXISTS default_model_profile_id VARCHAR;
ALTER TABLE process_policies ADD COLUMN IF NOT EXISTS default_tactic_profile_id VARCHAR;
ALTER TABLE process_policies ADD COLUMN IF NOT EXISTS allowed_model_profile_ids JSONB;
ALTER TABLE process_policies ADD COLUMN IF NOT EXISTS blocked_model_profile_ids JSONB;
ALTER TABLE process_policies ADD COLUMN IF NOT EXISTS allowed_tactic_profile_ids JSONB;
ALTER TABLE process_policies ADD COLUMN IF NOT EXISTS privacy_override VARCHAR;
ALTER TABLE process_policies ADD COLUMN IF NOT EXISTS cost_sensitivity_override VARCHAR;
ALTER TABLE process_policies ADD COLUMN IF NOT EXISTS force_escalation_for_grades JSONB;
ALTER TABLE process_policies ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;

-- Migrate data from overrides JSONB to individual columns
UPDATE process_policies
SET
  default_model_profile_id = COALESCE(overrides->>'defaultModelProfileId', default_model_profile_id),
  default_tactic_profile_id = COALESCE(overrides->>'defaultTacticProfileId', default_tactic_profile_id),
  allowed_model_profile_ids = COALESCE(overrides->'allowedModelProfileIds', allowed_model_profile_ids::jsonb),
  blocked_model_profile_ids = COALESCE(overrides->'blockedModelProfileIds', blocked_model_profile_ids::jsonb),
  allowed_tactic_profile_ids = COALESCE(overrides->'allowedTacticProfileIds', allowed_tactic_profile_ids::jsonb),
  privacy_override = COALESCE(overrides->>'privacyOverride', privacy_override),
  cost_sensitivity_override = COALESCE(overrides->>'costSensitivityOverride', cost_sensitivity_override),
  force_escalation_for_grades = COALESCE(overrides->'forceEscalationForGrades', force_escalation_for_grades::jsonb),
  enabled = COALESCE((overrides->>'enabled')::boolean, enabled)
WHERE overrides IS NOT NULL AND overrides != '{}'::jsonb;

-- Drop the old overrides column
ALTER TABLE process_policies ALTER COLUMN overrides DROP NOT NULL;

COMMIT;
