import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { OperationalIntegrityChecker } from './OperationalIntegrityChecker.js';
import { PgExecutionRecordReadRepository } from '../repositories/PgExecutionRecordReadRepository.js';
import { PgProviderRepository } from '@acds/persistence-pg';
import { ProviderVendor, AuthType, DecisionPosture, CognitiveGrade } from '@acds/core-types';
import { createTestPool, runMigrations, closePool, truncateAll, type PoolLike } from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;
let executionRepo: PgExecutionRecordReadRepository;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  executionRepo = new PgExecutionRecordReadRepository(pool as any);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

const UUID_PROV1 = '00000000-0000-0000-0000-000000000001';
const UUID_EXEC1 = '10000000-0000-0000-0000-000000000001';
const UUID_EXEC2 = '10000000-0000-0000-0000-000000000002';

async function seedProvider(id: string) {
  await pool.query(
    `INSERT INTO providers (id, name, vendor, auth_type, base_url, enabled, environment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, 'TestProvider', ProviderVendor.OPENAI, AuthType.API_KEY, 'https://api.openai.com', true, 'cloud'],
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
      id, 'test', 'test', 'test',
      overrides.decisionPosture ?? DecisionPosture.ADVISORY,
      overrides.cognitiveGrade ?? CognitiveGrade.BASIC,
      'rd-1', 'mp-1', 'tp-1', overrides.selectedProviderId ?? UUID_PROV1,
      overrides.status ?? 'succeeded',
      overrides.inputTokens ?? 100,
      overrides.outputTokens ?? 200,
      overrides.latencyMs !== undefined ? overrides.latencyMs : 50,
      0,
      'output',
      overrides.errorMessage ?? null,
      overrides.fallbackAttempts ?? 0,
      overrides.createdAt ?? new Date(),
      overrides.completedAt !== undefined ? overrides.completedAt : new Date(),
    ],
  );
}

describe('OperationalIntegrityChecker', () => {
  it('has correct metadata', () => {
    const checker = new OperationalIntegrityChecker(executionRepo);
    expect(checker.name).toBe('OperationalIntegrityChecker');
    expect(checker.invariantIds).toEqual(['INV-008']);
    expect(checker.supportedCadences).toContain('daily');
  });

  describe('INV-008', () => {
    it('passes for valid executions', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1);
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.invariantId).toBe('INV-008');
      // Should be pass unless there are anomalies
      const invalidPostureDefects = inv.defects.filter(d => d.title.includes('posture'));
      expect(invalidPostureDefects).toHaveLength(0);
    });

    it('detects invalid decision posture', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { decisionPosture: 'BOGUS_POSTURE' });
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('decision posture'))).toBe(true);
    });

    it('detects invalid cognitive grade', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { cognitiveGrade: 'INVALID_GRADE' });
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('cognitive grade'))).toBe(true);
    });

    it('detects negative latency', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { latencyMs: -10 });
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('Negative latency'))).toBe(true);
    });

    it('detects anomalously high latency', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { latencyMs: 500_000 });
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('high latency'))).toBe(true);
    });

    it('detects completed execution missing completedAt', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { status: 'succeeded', completedAt: null });
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('missing completedAt'))).toBe(true);
    });

    it('detects stale pending execution', async () => {
      await seedProvider(UUID_PROV1);
      const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
      await seedExecution(UUID_EXEC1, { status: 'pending', createdAt: twoHoursAgo, completedAt: null });
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('Stale execution'))).toBe(true);
    });

    it('detects stale running execution', async () => {
      await seedProvider(UUID_PROV1);
      const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
      await seedExecution(UUID_EXEC1, { status: 'running', createdAt: twoHoursAgo, completedAt: null });
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('Stale execution'))).toBe(true);
    });

    it('detects execution gap between consecutive executions', async () => {
      await seedProvider(UUID_PROV1);
      const fiveHoursAgo = new Date(Date.now() - 5 * 3600_000);
      const now = new Date();
      await seedExecution(UUID_EXEC1, { createdAt: fiveHoursAgo, completedAt: fiveHoursAgo });
      await seedExecution(UUID_EXEC2, { createdAt: now, completedAt: now });
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('Execution gap'))).toBe(true);
    });

    it('passes with no executions', async () => {
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.status).toBe('pass');
      expect(inv.sampleSize).toBe(0);
    });

    it('does not flag gap with single execution', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1);
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      const gapDefects = inv.defects.filter(d => d.title.includes('Execution gap'));
      expect(gapDefects).toHaveLength(0);
    });

    it('handles fallback_succeeded and fallback_failed as terminal statuses', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { status: 'fallback_succeeded', completedAt: null });
      await seedExecution(UUID_EXEC2, { status: 'fallback_failed', completedAt: null });
      const checker = new OperationalIntegrityChecker(executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      const missingCompletedAt = inv.defects.filter(d => d.title.includes('missing completedAt'));
      expect(missingCompletedAt).toHaveLength(2);
    });
  });
});
