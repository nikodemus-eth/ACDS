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
