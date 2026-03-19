-- Migration 004: Policies
-- Global, application-level, and process-level policy tables.

BEGIN;

-- ---------------------------------------------------------------------------
-- global_policies
-- ---------------------------------------------------------------------------
CREATE TABLE global_policies (
    id                                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    allowed_vendors                         JSONB,
    blocked_vendors                         JSONB,
    default_privacy                         VARCHAR,
    default_cost_sensitivity                VARCHAR,
    structured_output_required_for_grades   JSONB,
    traceability_required_for_grades        JSONB,
    max_latency_ms_by_load_tier             JSONB,
    local_preferred_task_types              JSONB,
    cloud_required_load_tiers               JSONB,
    enabled                                 BOOLEAN     DEFAULT true,
    updated_at                              TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- application_policies
-- ---------------------------------------------------------------------------
CREATE TABLE application_policies (
    id                                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    application                             VARCHAR     NOT NULL UNIQUE,
    allowed_vendors                         JSONB,
    blocked_vendors                         JSONB,
    privacy_override                        VARCHAR,
    cost_sensitivity_override               VARCHAR,
    preferred_model_profile_ids             JSONB,
    blocked_model_profile_ids               JSONB,
    local_preferred_task_types              JSONB,
    structured_output_required_for_grades   JSONB,
    enabled                                 BOOLEAN     DEFAULT true,
    updated_at                              TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- process_policies
-- ---------------------------------------------------------------------------
CREATE TABLE process_policies (
    id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    application                     VARCHAR     NOT NULL,
    process                         VARCHAR     NOT NULL,
    step                            VARCHAR,
    default_model_profile_id        VARCHAR,
    default_tactic_profile_id       VARCHAR,
    allowed_model_profile_ids       JSONB,
    blocked_model_profile_ids       JSONB,
    allowed_tactic_profile_ids      JSONB,
    privacy_override                VARCHAR,
    cost_sensitivity_override       VARCHAR,
    force_escalation_for_grades     JSONB,
    enabled                         BOOLEAN     DEFAULT true,
    updated_at                      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(application, process, step)
);

COMMIT;
