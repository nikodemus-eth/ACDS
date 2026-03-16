-- Migration 002: Provider Health
-- Tracks real-time health status for each provider.

BEGIN;

CREATE TABLE provider_health (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id     UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE UNIQUE,
    status          VARCHAR     NOT NULL DEFAULT 'unknown',
    latency_ms      INTEGER,
    last_test_at    TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    message         TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
