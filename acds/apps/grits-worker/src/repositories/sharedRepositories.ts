/**
 * Shared repository singletons for GRITS worker.
 *
 * All repositories are backed by PostgreSQL via the persistence-pg package.
 */

import type { OptimizerStateRepository } from '@acds/adaptive-optimizer';
import type { AdaptationApprovalRepository } from '@acds/adaptive-optimizer';
import type { ProviderRepository } from '@acds/provider-broker';
import {
  createPool,
  PgOptimizerStateRepository,
  PgAdaptationApprovalRepository,
  PgProviderRepository,
  PgPolicyRepository,
} from '@acds/persistence-pg';
import type { PgPolicyRepository as PolicyRepo } from '@acds/persistence-pg';
import type { AdaptationLedgerWriter, AdaptationEvent, AdaptationEventFilters } from '@acds/adaptive-optimizer';

function createWorkerPool() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/acds');
  return createPool({
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
    database: databaseUrl.pathname.replace(/^\//, ''),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    ssl: databaseUrl.searchParams.get('sslmode') === 'require',
  });
}

const pool = createWorkerPool();

/**
 * Pg-backed adaptation ledger that writes to auto_apply_decision_records.
 * Reads use the adaptation event table convention.
 */
class PgAdaptationLedger implements AdaptationLedgerWriter {
  async writeEvent(event: AdaptationEvent): Promise<void> {
    await pool.query(
      `INSERT INTO auto_apply_decision_records (id, family_key, reason, mode, risk_basis, applied_at, previous_ranking, new_ranking)
       VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, '[]'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.familyKey, event.trigger, event.trigger, event.trigger, event.createdAt],
    );
  }

  async listEvents(familyKey: string, filters?: AdaptationEventFilters): Promise<AdaptationEvent[]> {
    const conditions = ['family_key = $1'];
    const params: unknown[] = [familyKey];
    let paramIdx = 2;

    if (filters?.since) {
      conditions.push(`applied_at >= $${paramIdx}`);
      params.push(filters.since);
      paramIdx++;
    }
    if (filters?.until) {
      conditions.push(`applied_at <= $${paramIdx}`);
      params.push(filters.until);
      paramIdx++;
    }

    let sql = `SELECT id, family_key, reason AS trigger, applied_at AS created_at FROM auto_apply_decision_records WHERE ${conditions.join(' AND ')} ORDER BY applied_at DESC`;
    if (filters?.limit) {
      sql += ` LIMIT $${paramIdx}`;
      params.push(filters.limit);
    }

    const result = await pool.query(sql, params);
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      familyKey: row.family_key as string,
      trigger: row.trigger as string,
      createdAt: row.created_at as string,
    } as AdaptationEvent));
  }

  async getEvent(id: string): Promise<AdaptationEvent | undefined> {
    const result = await pool.query(
      'SELECT id, family_key, reason AS trigger, applied_at AS created_at FROM auto_apply_decision_records WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0];
    return {
      id: row.id as string,
      familyKey: row.family_key as string,
      trigger: row.trigger as string,
      createdAt: row.created_at as string,
    } as AdaptationEvent;
  }
}

// ── Singletons ──────────────────────────────────────────────────────────

const optimizerRepo = new PgOptimizerStateRepository(pool);
const approvalRepo = new PgAdaptationApprovalRepository(pool);
const ledger = new PgAdaptationLedger();
const providerRepo = new PgProviderRepository(pool);
const policyRepo = new PgPolicyRepository(pool);

export function getSharedOptimizerStateRepository(): OptimizerStateRepository { return optimizerRepo; }
export function getSharedApprovalRepository(): AdaptationApprovalRepository { return approvalRepo; }
export function getSharedLedger(): AdaptationLedgerWriter { return ledger; }
export function getSharedProviderRepository(): ProviderRepository { return providerRepo; }
export function getSharedPolicyRepository(): PolicyRepo { return policyRepo; }
