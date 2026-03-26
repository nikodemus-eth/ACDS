-- Migration 009: Align execution persistence with runtime contracts and add
-- GRITS snapshot storage.

BEGIN;

ALTER TABLE execution_records
    ADD COLUMN IF NOT EXISTS application VARCHAR,
    ADD COLUMN IF NOT EXISTS process VARCHAR,
    ADD COLUMN IF NOT EXISTS step VARCHAR,
    ADD COLUMN IF NOT EXISTS decision_posture VARCHAR,
    ADD COLUMN IF NOT EXISTS cognitive_grade VARCHAR,
    ADD COLUMN IF NOT EXISTS routing_decision_id VARCHAR,
    ADD COLUMN IF NOT EXISTS selected_model_profile_id VARCHAR,
    ADD COLUMN IF NOT EXISTS selected_tactic_profile_id VARCHAR,
    ADD COLUMN IF NOT EXISTS selected_provider_id VARCHAR,
    ADD COLUMN IF NOT EXISTS input_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS cost_estimate NUMERIC,
    ADD COLUMN IF NOT EXISTS normalized_output TEXT,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS fallback_attempts INTEGER NOT NULL DEFAULT 0;

UPDATE execution_records
SET
    application = COALESCE(application, routing_request ->> 'application'),
    process = COALESCE(process, routing_request ->> 'process'),
    step = COALESCE(step, routing_request ->> 'step'),
    decision_posture = COALESCE(decision_posture, routing_request ->> 'decisionPosture'),
    cognitive_grade = COALESCE(cognitive_grade, routing_request ->> 'cognitiveGrade'),
    routing_decision_id = COALESCE(routing_decision_id, routing_decision ->> 'id', id::text),
    selected_model_profile_id = COALESCE(selected_model_profile_id, routing_decision ->> 'selectedModelProfileId', model_profile_id::text),
    selected_tactic_profile_id = COALESCE(selected_tactic_profile_id, routing_decision ->> 'selectedTacticProfileId', tactic_profile_id::text),
    selected_provider_id = COALESCE(selected_provider_id, routing_decision ->> 'selectedProviderId', provider_id::text),
    normalized_output = COALESCE(normalized_output, output_payload ->> 'content'),
    error_message = COALESCE(error_message, error_details ->> 'message'),
    fallback_attempts = COALESCE(
        NULLIF(fallback_attempts, 0),
        (SELECT COUNT(*) FROM fallback_attempts fa WHERE fa.execution_id = execution_records.id),
        0
    )
WHERE
    application IS NULL
    OR process IS NULL
    OR step IS NULL
    OR decision_posture IS NULL
    OR cognitive_grade IS NULL
    OR routing_decision_id IS NULL
    OR selected_model_profile_id IS NULL
    OR selected_tactic_profile_id IS NULL
    OR selected_provider_id IS NULL
    OR normalized_output IS NULL
    OR error_message IS NULL
    OR fallback_attempts = 0;

CREATE INDEX IF NOT EXISTS idx_execution_records_family
    ON execution_records (application, process, step);

CREATE INDEX IF NOT EXISTS idx_execution_records_routing_decision_id
    ON execution_records (routing_decision_id);

CREATE INDEX IF NOT EXISTS idx_execution_records_selected_provider_id
    ON execution_records (selected_provider_id);

CREATE TABLE IF NOT EXISTS integrity_snapshots (
    id                TEXT PRIMARY KEY,
    cadence           VARCHAR NOT NULL,
    started_at        TIMESTAMPTZ NOT NULL,
    completed_at      TIMESTAMPTZ NOT NULL,
    total_duration_ms INTEGER NOT NULL,
    results           JSONB NOT NULL,
    overall_status    VARCHAR NOT NULL,
    defect_count      JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrity_snapshots_cadence_completed
    ON integrity_snapshots (cadence, completed_at DESC);

COMMIT;
