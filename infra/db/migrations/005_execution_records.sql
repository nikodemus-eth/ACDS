-- Migration 005: Execution Records
-- Stores execution history for cognitive dispatch routing decisions.

BEGIN;

-- ---------------------------------------------------------------------------
-- execution_records
-- ---------------------------------------------------------------------------
CREATE TABLE execution_records (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    application                 VARCHAR     NOT NULL,
    process                     VARCHAR     NOT NULL,
    step                        VARCHAR     NOT NULL,
    decision_posture            VARCHAR     NOT NULL,
    cognitive_grade             VARCHAR     NOT NULL,
    routing_decision_id         VARCHAR     NOT NULL,
    selected_model_profile_id   VARCHAR     NOT NULL,
    selected_tactic_profile_id  VARCHAR     NOT NULL,
    selected_provider_id        VARCHAR     NOT NULL,
    status                      VARCHAR     NOT NULL,
    input_tokens                INTEGER,
    output_tokens               INTEGER,
    latency_ms                  INTEGER,
    cost_estimate               NUMERIC,
    normalized_output           TEXT,
    error_message               TEXT,
    fallback_attempts           INTEGER     NOT NULL DEFAULT 0,
    completed_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_execution_records_family ON execution_records(application, process, step);
CREATE INDEX idx_execution_records_status ON execution_records(status);
CREATE INDEX idx_execution_records_created_at ON execution_records(created_at);

COMMIT;
