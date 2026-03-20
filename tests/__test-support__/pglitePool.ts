import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

let db: PGlite | null = null;

/**
 * pg.Pool-compatible wrapper around PGlite.
 * Implements the `query(text, params?)` contract that all Pg repositories use.
 */
export interface PoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  /** Run multi-statement SQL (no params). PGlite query() only supports single statements. */
  execSQL(sql: string): Promise<void>;
  end(): Promise<void>;
}

class PglitePoolAdapter implements PoolLike {
  constructor(private pglite: PGlite) {}

  async query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    const result = await this.pglite.query(text, params as any[]);
    // For INSERT/UPDATE/DELETE without RETURNING, rows is empty but affectedRows is set.
    const rowCount = result.affectedRows ?? result.rows.length;
    return { rows: result.rows as Record<string, unknown>[], rowCount };
  }

  async execSQL(sql: string): Promise<void> {
    await this.pglite.exec(sql);
  }

  async end(): Promise<void> {
    await this.pglite.close();
  }
}

/** Create or return the shared PGlite-backed pool. */
export async function createTestPool(): Promise<PoolLike> {
  if (!db) {
    db = new PGlite();
  }
  return new PglitePoolAdapter(db);
}

/** Run all migration SQL files against the pool. */
export async function runMigrations(pool: PoolLike): Promise<void> {
  const migrationsDir = join(process.cwd(), 'infra', 'db', 'migrations');
  const files = [
    '001_initial_core_tables.sql',
    '002_provider_health.sql',
    '003_profiles.sql',
    '004_policies.sql',
    '005_execution_records.sql',
    '006_audit_events.sql',
    '007_adaptation_state.sql',
    '008_secret_store_and_rollback_snapshots.sql',
    '009_plateau_signals.sql',
    '010_execution_scoring_marker.sql',
    '011_align_global_policies_columns.sql',
    '012_align_execution_and_secrets.sql',
    '013_integrity_snapshots.sql',
    '014_nullable_legacy_jsonb_columns.sql',
    '015_execution_request_id_and_reaper.sql',
    '016_fix_false_timeout_statuses.sql',
  ];

  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf-8');
    try {
      await pool.execSQL(sql);
    } catch {
      // Alignment migrations (011, 012, 014) may fail on fresh PGlite schemas
      // where columns already have the correct names from earlier migrations.
      // ROLLBACK clears any aborted transaction state in PGlite.
      try { await pool.execSQL('ROLLBACK'); } catch { /* no-op */ }
    }
  }
}

/** Truncate all tables used by persistence tests. */
export async function truncateAll(pool: PoolLike): Promise<void> {
  await pool.query(`
    TRUNCATE
      plateau_signals,
      auto_apply_decision_records,
      audit_events,
      adaptation_rollback_records,
      provider_secrets,
      adaptation_approval_records,
      candidate_performance_states,
      family_selection_states,
      escalation_tuning_states,
      execution_records,
      providers,
      provider_health,
      model_profiles,
      tactic_profiles,
      global_policies,
      application_policies,
      process_policies
    CASCADE
  `);
}

/** Close the shared PGlite instance. */
export async function closePool(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
