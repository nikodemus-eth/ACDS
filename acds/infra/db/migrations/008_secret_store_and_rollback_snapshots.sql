-- Migration 008: Provider secrets table + rollback snapshot columns
-- Adds persistent encrypted secret storage and enriches rollback records
-- with full ranking snapshots.

BEGIN;

-- ─── Provider Secrets ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_secrets (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id     VARCHAR     NOT NULL UNIQUE,
    envelope        JSONB       NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ
);

CREATE INDEX idx_provider_secrets_provider ON provider_secrets(provider_id);

-- ─── Enrich rollback records with snapshot data ───────────────────────────

ALTER TABLE adaptation_rollback_records
    ADD COLUMN IF NOT EXISTS target_adaptation_event_id TEXT,
    ADD COLUMN IF NOT EXISTS previous_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS restored_snapshot JSONB;

COMMIT;
