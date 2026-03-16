-- Migration 005: Execution Records
-- Stores execution history, rationales, and fallback attempts.

BEGIN;

-- ---------------------------------------------------------------------------
-- execution_records
-- ---------------------------------------------------------------------------
CREATE TABLE execution_records (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    routing_request     JSONB       NOT NULL,
    routing_decision    JSONB       NOT NULL,
    status              VARCHAR     NOT NULL,
    provider_id         UUID,
    model_profile_id    UUID,
    tactic_profile_id   UUID,
    input_payload       JSONB,
    output_payload      JSONB,
    error_details       JSONB,
    latency_ms          INTEGER,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_execution_records_status ON execution_records(status);
CREATE INDEX idx_execution_records_created_at ON execution_records(created_at);
CREATE INDEX idx_execution_records_provider_id ON execution_records(provider_id);

-- ---------------------------------------------------------------------------
-- execution_rationales
-- ---------------------------------------------------------------------------
CREATE TABLE execution_rationales (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id        UUID        NOT NULL REFERENCES execution_records(id) ON DELETE CASCADE,
    family_key          VARCHAR     NOT NULL,
    rationale_summary   TEXT,
    details             JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- fallback_attempts
-- ---------------------------------------------------------------------------
CREATE TABLE fallback_attempts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id        UUID        NOT NULL REFERENCES execution_records(id) ON DELETE CASCADE,
    attempt_number      INTEGER     NOT NULL,
    provider_id         UUID,
    status              VARCHAR     NOT NULL,
    error_details       JSONB,
    latency_ms          INTEGER,
    attempted_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
