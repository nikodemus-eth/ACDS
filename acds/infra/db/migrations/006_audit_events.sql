-- Migration 006: Audit Events
-- Central audit log for all system-level actions.

BEGIN;

CREATE TABLE audit_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      VARCHAR     NOT NULL,
    actor           VARCHAR,
    action          VARCHAR     NOT NULL,
    resource_type   VARCHAR,
    resource_id     VARCHAR,
    application     VARCHAR,
    details         JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at);
CREATE INDEX idx_audit_events_application ON audit_events(application);
CREATE INDEX idx_audit_events_resource ON audit_events(resource_type, resource_id);

COMMIT;
