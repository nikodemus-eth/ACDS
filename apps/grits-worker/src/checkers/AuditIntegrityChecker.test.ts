import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { AuditIntegrityChecker } from './AuditIntegrityChecker.js';
import { PgAuditEventReadRepository } from '../repositories/PgAuditEventReadRepository.js';
import { PgExecutionRecordReadRepository } from '../repositories/PgExecutionRecordReadRepository.js';
import { PgProviderRepository, PgAdaptationApprovalRepository } from '@acds/persistence-pg';
import { ProviderVendor, AuthType } from '@acds/core-types';
import { createTestPool, runMigrations, closePool, truncateAll, type PoolLike } from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;
let auditRepo: PgAuditEventReadRepository;
let executionRepo: PgExecutionRecordReadRepository;
let approvalRepo: PgAdaptationApprovalRepository;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  auditRepo = new PgAuditEventReadRepository(pool as any);
  executionRepo = new PgExecutionRecordReadRepository(pool as any);
  approvalRepo = new PgAdaptationApprovalRepository(pool as any);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

const UUID_PROV1 = '00000000-0000-0000-0000-000000000001';
const UUID_EXEC1 = '10000000-0000-0000-0000-000000000001';
const UUID_AE1   = '20000000-0000-0000-0000-000000000001';
const UUID_RES1  = '30000000-0000-0000-0000-000000000001';

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
      id, 'test', 'test', 'test', 'advisory', 'basic', 'rd-1', 'mp-1', 'tp-1', UUID_PROV1,
      overrides.status ?? 'succeeded', 100, 200, 50, 0, 'output', null, 0, new Date(), new Date(),
    ],
  );
}

async function seedAuditEvent(id: string, overrides: Record<string, unknown> = {}) {
  await pool.query(
    `INSERT INTO audit_events (id, event_type, actor, action, resource_type, resource_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      overrides.eventType ?? 'execution',
      overrides.actor ?? 'system',
      overrides.action ?? 'execution_completed',
      overrides.resourceType ?? 'execution',
      overrides.resourceId ?? UUID_EXEC1,
      JSON.stringify(overrides.details ?? {}),
      new Date(),
    ],
  );
}

describe('AuditIntegrityChecker', () => {
  it('has correct metadata', () => {
    const checker = new AuditIntegrityChecker(auditRepo, executionRepo, approvalRepo);
    expect(checker.name).toBe('AuditIntegrityChecker');
    expect(checker.invariantIds).toEqual(['INV-007']);
    expect(checker.supportedCadences).toContain('daily');
    expect(checker.supportedCadences).toContain('release');
  });

  describe('INV-007: Complete audit trails', () => {
    it('passes when no executions or events exist', async () => {
      const checker = new AuditIntegrityChecker(auditRepo, executionRepo, approvalRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.status).toBe('pass');
    });

    it('fails when execution has no audit event', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1);
      const checker = new AuditIntegrityChecker(auditRepo, executionRepo, approvalRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('missing audit trail'))).toBe(true);
    });

    it('passes when execution has matching audit event', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1);
      await seedAuditEvent(UUID_AE1, { resourceId: UUID_EXEC1, action: 'execution_completed' });
      const checker = new AuditIntegrityChecker(auditRepo, executionRepo, approvalRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      const missingTrail = inv.defects.filter(d => d.title.includes('missing audit trail'));
      expect(missingTrail).toHaveLength(0);
    });

    it('flags audit events with missing actor', async () => {
      await seedAuditEvent(UUID_AE1, { actor: '', action: 'some_action', resourceId: UUID_RES1 });
      const checker = new AuditIntegrityChecker(auditRepo, executionRepo, approvalRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('missing actor'))).toBe(true);
    });

    it('flags audit events with unknown actor', async () => {
      await seedAuditEvent(UUID_AE1, { actor: 'unknown', action: 'some_action', resourceId: UUID_RES1 });
      const checker = new AuditIntegrityChecker(auditRepo, executionRepo, approvalRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('missing actor'))).toBe(true);
    });

    it('flags fallback execution without fallback audit event', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { status: 'fallback_succeeded' });
      // Has an audit event but not a fallback one
      await seedAuditEvent(UUID_AE1, { resourceId: UUID_EXEC1, action: 'execution_completed' });
      const checker = new AuditIntegrityChecker(auditRepo, executionRepo, approvalRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('fallback audit event'))).toBe(true);
    });

    it('passes for fallback execution with fallback audit event', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { status: 'fallback_succeeded' });
      await seedAuditEvent(UUID_AE1, { resourceId: UUID_EXEC1, action: 'fallback_executed' });
      const checker = new AuditIntegrityChecker(auditRepo, executionRepo, approvalRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      const fallbackDefects = inv.defects.filter(d => d.title.includes('fallback audit event'));
      expect(fallbackDefects).toHaveLength(0);
    });
  });
});
