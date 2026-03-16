-- Migration 001: Initial Core Tables
-- Creates the foundational tables for providers, secrets, and admin sessions.

BEGIN;

-- ---------------------------------------------------------------------------
-- providers
-- ---------------------------------------------------------------------------
CREATE TABLE providers (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR     NOT NULL,
    vendor          VARCHAR     NOT NULL,
    auth_type       VARCHAR     NOT NULL,
    base_url        VARCHAR     NOT NULL,
    enabled         BOOLEAN     DEFAULT true,
    environment     VARCHAR     DEFAULT 'development',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- provider_secrets
-- ---------------------------------------------------------------------------
CREATE TABLE provider_secrets (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id     UUID        NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    ciphertext_blob TEXT        NOT NULL,
    key_id          VARCHAR     NOT NULL,
    algorithm       VARCHAR     DEFAULT 'aes-256-gcm',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    rotated_at      TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- admin_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE admin_sessions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token_hash  VARCHAR     NOT NULL UNIQUE,
    actor               VARCHAR     NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL
);

COMMIT;
