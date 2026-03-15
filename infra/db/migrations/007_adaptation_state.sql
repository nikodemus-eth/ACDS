-- 007_adaptation_state.sql
-- Tables for adaptive optimizer state, approvals, rollbacks, escalation tuning, and auto-apply decisions.

BEGIN;

-- ─── Family Selection States ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_selection_states (
    family_key            TEXT        PRIMARY KEY,
    current_candidate_id  TEXT        NOT NULL,
    rolling_score         NUMERIC     NOT NULL DEFAULT 0,
    exploration_rate      NUMERIC     NOT NULL DEFAULT 0,
    plateau_detected      BOOLEAN     NOT NULL DEFAULT FALSE,
    last_adaptation_at    TEXT        NOT NULL,
    recent_trend          TEXT        NOT NULL DEFAULT 'stable'
        CHECK (recent_trend IN ('improving', 'stable', 'declining'))
);

CREATE INDEX idx_family_selection_states_trend
    ON family_selection_states (recent_trend);

CREATE INDEX idx_family_selection_states_plateau
    ON family_selection_states (plateau_detected)
    WHERE plateau_detected = TRUE;

-- ─── Candidate Performance States ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS candidate_performance_states (
    candidate_id    TEXT        NOT NULL,
    family_key      TEXT        NOT NULL,
    rolling_score   NUMERIC     NOT NULL DEFAULT 0,
    run_count       INTEGER     NOT NULL DEFAULT 0,
    success_rate    NUMERIC     NOT NULL DEFAULT 0,
    average_latency NUMERIC     NOT NULL DEFAULT 0,
    last_selected_at TEXT       NOT NULL,
    PRIMARY KEY (candidate_id, family_key)
);

CREATE INDEX idx_candidate_perf_family
    ON candidate_performance_states (family_key);

CREATE INDEX idx_candidate_perf_score
    ON candidate_performance_states (family_key, rolling_score DESC);

-- ─── Adaptation Approval Records ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS adaptation_approval_records (
    id                TEXT        PRIMARY KEY,
    family_key        TEXT        NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'superseded')),
    recommendation_id TEXT        NOT NULL,
    submitted_at      TEXT        NOT NULL,
    decided_at        TEXT,
    decided_by        TEXT,
    reason            TEXT,
    expires_at        TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adaptation_approval_family
    ON adaptation_approval_records (family_key);

CREATE INDEX idx_adaptation_approval_status
    ON adaptation_approval_records (status)
    WHERE status = 'pending';

CREATE INDEX idx_adaptation_approval_recommendation
    ON adaptation_approval_records (recommendation_id);

-- ─── Adaptation Rollback Records ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS adaptation_rollback_records (
    id           TEXT        PRIMARY KEY,
    family_key   TEXT        NOT NULL,
    snapshot_id  TEXT        NOT NULL,
    reason       TEXT        NOT NULL,
    executed_by  TEXT        NOT NULL,
    executed_at  TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adaptation_rollback_family
    ON adaptation_rollback_records (family_key);

CREATE INDEX idx_adaptation_rollback_executed
    ON adaptation_rollback_records (executed_at DESC);

-- ─── Escalation Tuning States ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS escalation_tuning_states (
    family_key         TEXT        PRIMARY KEY,
    preference_level   TEXT        NOT NULL,
    last_tuned_at      TIMESTAMPTZ NOT NULL,
    local_success_rate NUMERIC     NOT NULL DEFAULT 0,
    cloud_success_rate NUMERIC     NOT NULL DEFAULT 0
);

CREATE INDEX idx_escalation_tuning_preference
    ON escalation_tuning_states (preference_level);

-- ─── Auto-Apply Decision Records ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auto_apply_decision_records (
    id                TEXT        PRIMARY KEY,
    family_key        TEXT        NOT NULL,
    previous_ranking  JSONB       NOT NULL DEFAULT '[]'::JSONB,
    new_ranking       JSONB       NOT NULL DEFAULT '[]'::JSONB,
    reason            TEXT        NOT NULL,
    mode              TEXT        NOT NULL,
    risk_basis        TEXT        NOT NULL,
    applied_at        TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auto_apply_family
    ON auto_apply_decision_records (family_key);

CREATE INDEX idx_auto_apply_applied
    ON auto_apply_decision_records (applied_at DESC);

CREATE INDEX idx_auto_apply_mode
    ON auto_apply_decision_records (mode);

COMMIT;
