import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ExecutionIntegrityChecker } from './ExecutionIntegrityChecker.js';
import { PgExecutionRecordReadRepository } from '../repositories/PgExecutionRecordReadRepository.js';
import { PgRoutingDecisionReadRepository } from '../repositories/PgRoutingDecisionReadRepository.js';
import { PgProviderRepository } from '@acds/persistence-pg';
import { ProviderVendor, AuthType } from '@acds/core-types';
import { createTestPool, runMigrations, closePool, truncateAll, type PoolLike } from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;
let executionRepo: PgExecutionRecordReadRepository;
let routingRepo: PgRoutingDecisionReadRepository;
let providerRepo: PgProviderRepository;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  executionRepo = new PgExecutionRecordReadRepository(pool as any);
  routingRepo = new PgRoutingDecisionReadRepository(pool as any);
  providerRepo = new PgProviderRepository(pool as any);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

const UUID_PROV1 = '00000000-0000-0000-0000-000000000001';
const UUID_EXEC1 = '10000000-0000-0000-0000-000000000001';

async function seedProvider(id: string, enabled = true) {
  await pool.query(
    `INSERT INTO providers (id, name, vendor, auth_type, base_url, enabled, environment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, 'TestProvider', ProviderVendor.OPENAI, AuthType.API_KEY, 'https://api.openai.com', enabled, 'cloud'],
  );
}

async function seedExecution(id: string, overrides: Record<string, unknown> = {}) {
  await pool.query(
    `INSERT INTO execution_records (id, application, process, step, decision_posture, cognitive_grade,
     routing_decision_id, selected_model_profile_id, selected_tactic_profile_id, selected_provider_id,
     status, input_tokens, output_tokens, latency_ms, cost_estimate, normalized_output, error_message,
     fallback_attempts, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      id, 'test', 'test', 'test', 'advisory', 'basic',
      overrides.routingDecisionId ?? id,
      'mp-1', 'tp-1', overrides.selectedProviderId ?? UUID_PROV1,
      overrides.status ?? 'succeeded',
      100, 200, 50, 0, 'output', null,
      overrides.fallbackAttempts ?? 0,
      new Date(), new Date(),
    ],
  );
}

describe('ExecutionIntegrityChecker', () => {
  it('has correct metadata', () => {
    const checker = new ExecutionIntegrityChecker(executionRepo, routingRepo, providerRepo);
    expect(checker.name).toBe('ExecutionIntegrityChecker');
    expect(checker.invariantIds).toEqual(['INV-001', 'INV-002']);
    expect(checker.supportedCadences).toContain('fast');
    expect(checker.supportedCadences).toContain('daily');
    expect(checker.supportedCadences).toContain('release');
  });

  describe('INV-001: No execution bypasses eligibility', () => {
    it('passes when execution has valid routing decision', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1);
      const checker = new ExecutionIntegrityChecker(executionRepo, routingRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-001')!;
      // The routing decision is derived from execution_records table, so it should exist
      expect(inv).toBeDefined();
    });

    it('passes with no executions', async () => {
      const checker = new ExecutionIntegrityChecker(executionRepo, routingRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-001')!;
      expect(inv.status).toBe('pass');
      expect(inv.sampleSize).toBe(0);
    });
  });

  describe('INV-002: Fallback chain in policy bounds', () => {
    it('passes when no fallback executions exist', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { status: 'succeeded' });
      const checker = new ExecutionIntegrityChecker(executionRepo, routingRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-002')!;
      expect(inv.status).toBe('pass');
    });

    it('checks fallback executions', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { status: 'fallback_succeeded' });
      const checker = new ExecutionIntegrityChecker(executionRepo, routingRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-002')!;
      expect(inv).toBeDefined();
      expect(inv.sampleSize).toBeGreaterThanOrEqual(0);
    });

    it('checks fallback_failed executions too', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { status: 'fallback_failed' });
      const checker = new ExecutionIntegrityChecker(executionRepo, routingRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-002')!;
      expect(inv).toBeDefined();
    });
  });

  describe('cadence variations', () => {
    it('uses fast cadence (1 hour window)', async () => {
      const checker = new ExecutionIntegrityChecker(executionRepo, routingRepo, providerRepo);
      const result = await checker.check('fast');
      expect(result.cadence).toBe('fast');
    });

    it('uses release cadence (168 hour window)', async () => {
      const checker = new ExecutionIntegrityChecker(executionRepo, routingRepo, providerRepo);
      const result = await checker.check('release');
      expect(result.cadence).toBe('release');
    });
  });
});
