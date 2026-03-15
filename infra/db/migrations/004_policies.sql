-- Migration 004: Policies
-- Global, application-level, and process-level policy tables.

BEGIN;

-- ---------------------------------------------------------------------------
-- global_policies
-- ---------------------------------------------------------------------------
CREATE TABLE global_policies (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    allowed_vendors             JSONB,
    blocked_vendors             JSONB,
    default_privacy             VARCHAR,
    cost_sensitivity            VARCHAR,
    max_latency_by_load_tier    JSONB,
    structured_output_by_grade  JSONB,
    traceability_by_grade       JSONB,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- application_policies
-- ---------------------------------------------------------------------------
CREATE TABLE application_policies (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    application     VARCHAR     NOT NULL UNIQUE,
    overrides       JSONB       NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- process_policies
-- ---------------------------------------------------------------------------
CREATE TABLE process_policies (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    application     VARCHAR     NOT NULL,
    process         VARCHAR     NOT NULL,
    step            VARCHAR,
    overrides       JSONB       NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(application, process, step)
);

COMMIT;
