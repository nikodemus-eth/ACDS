-- Migration 009: Plateau signals table for adaptation pipeline
-- Stores plateau detection results from the PlateauDetector.

BEGIN;

CREATE TABLE IF NOT EXISTS plateau_signals (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    family_key                  TEXT        NOT NULL,
    detected                    BOOLEAN     NOT NULL DEFAULT FALSE,
    severity                    TEXT        NOT NULL DEFAULT 'none'
        CHECK (severity IN ('none', 'mild', 'moderate', 'severe')),
    flat_quality                BOOLEAN     NOT NULL DEFAULT FALSE,
    rising_cost                 BOOLEAN     NOT NULL DEFAULT FALSE,
    rising_correction_burden    BOOLEAN     NOT NULL DEFAULT FALSE,
    repeated_fallbacks          BOOLEAN     NOT NULL DEFAULT FALSE,
    persistent_underperformance BOOLEAN     NOT NULL DEFAULT FALSE,
    detected_at                 TEXT        NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plateau_signals_family
    ON plateau_signals (family_key);

CREATE INDEX idx_plateau_signals_detected
    ON plateau_signals (detected, created_at DESC)
    WHERE detected = TRUE;

COMMIT;
