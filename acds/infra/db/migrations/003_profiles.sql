-- Migration 003: Model and Tactic Profiles
-- Defines the model profiles and tactic profiles used by the routing engine.

BEGIN;

-- ---------------------------------------------------------------------------
-- model_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE model_profiles (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    VARCHAR     UNIQUE NOT NULL,
    supported_task_types    JSONB       NOT NULL,
    supported_load_tiers    JSONB       NOT NULL,
    minimum_cognitive_grade VARCHAR     NOT NULL,
    local_only              BOOLEAN     DEFAULT false,
    cloud_allowed           BOOLEAN     DEFAULT true,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- tactic_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE tactic_profiles (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        VARCHAR     UNIQUE NOT NULL,
    execution_method            VARCHAR     NOT NULL,
    multi_stage                 BOOLEAN     DEFAULT false,
    requires_structured_output  BOOLEAN     DEFAULT false,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
