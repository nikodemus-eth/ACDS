-- Migration 013: Create integrity_snapshots table for GRITS worker
-- The GRITS integrity verification system writes snapshots for each check cadence
-- (fast/daily/release). Without this table, all GRITS results are silently lost.

CREATE TABLE IF NOT EXISTS integrity_snapshots (
  id            TEXT PRIMARY KEY,
  cadence       TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  completed_at  TEXT NOT NULL,
  total_duration_ms INTEGER NOT NULL,
  results       JSONB NOT NULL,
  overall_status TEXT NOT NULL,
  defect_count  JSONB NOT NULL
);

-- Index for findLatestByCadence queries (ORDER BY completed_at DESC LIMIT 1)
CREATE INDEX IF NOT EXISTS idx_integrity_snapshots_cadence_completed
  ON integrity_snapshots (cadence, completed_at DESC);

-- Index for findByTimeRange queries
CREATE INDEX IF NOT EXISTS idx_integrity_snapshots_completed_at
  ON integrity_snapshots (completed_at);
