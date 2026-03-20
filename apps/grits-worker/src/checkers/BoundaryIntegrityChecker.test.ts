import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { BoundaryIntegrityChecker } from './BoundaryIntegrityChecker.js';
import { PgExecutionRecordReadRepository } from '../repositories/PgExecutionRecordReadRepository.js';
import { PgAuditEventReadRepository } from '../repositories/PgAuditEventReadRepository.js';
import { PgProviderRepository } from '@acds/persistence-pg';
import { ProviderVendor, AuthType } from '@acds/core-types';
import { createTestPool, runMigrations, closePool, truncateAll, type PoolLike } from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;
let executionRepo: PgExecutionRecordReadRepository;
let providerRepo: PgProviderRepository;
let auditRepo: PgAuditEventReadRepository;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  executionRepo = new PgExecutionRecordReadRepository(pool as any);
  providerRepo = new PgProviderRepository(pool as any);
  auditRepo = new PgAuditEventReadRepository(pool as any);
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
const UUID_NONEXISTENT = '99999999-9999-9999-9999-999999999999';

async function seedProvider(id: string, enabled = true) {
  await pool.query(
    `INSERT INTO providers (id, name, vendor, auth_type, base_url, enabled, environment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, 'TestProvider', ProviderVendor.OPENAI, AuthType.API_KEY, 'https://api.openai.com', enabled, 'cloud'],
  );
}

async function seedExecution(id: string, selectedProviderId: string) {
  await pool.query(
    `INSERT INTO execution_records (id, application, process, step, decision_posture, cognitive_grade,
     routing_decision_id, selected_model_profile_id, selected_tactic_profile_id, selected_provider_id,
     status, input_tokens, output_tokens, latency_ms, cost_estimate, normalized_output, error_message,
     fallback_attempts, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      id, 'test', 'test', 'test', 'advisory', 'basic', 'rd-1', 'mp-1', 'tp-1', selectedProviderId,
      'succeeded', 100, 200, 50, 0, 'output', null, 0, new Date(), new Date(),
    ],
  );
}

async function seedAuditEvent(id: string, action: string, resourceType: string) {
  await pool.query(
    `INSERT INTO audit_events (id, event_type, actor, action, resource_type, resource_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, 'system_event', 'system', action, resourceType, UUID_PROV1, '{}', new Date()],
  );
}

describe('BoundaryIntegrityChecker', () => {
  it('has correct metadata', () => {
    const checker = new BoundaryIntegrityChecker(executionRepo, providerRepo);
    expect(checker.name).toBe('BoundaryIntegrityChecker');
    expect(checker.invariantIds).toEqual(['INV-001']);
    expect(checker.supportedCadences).toContain('daily');
  });

  describe('boundary checks', () => {
    it('passes when all executions use enabled providers', async () => {
      await seedProvider(UUID_PROV1, true);
      await seedExecution(UUID_EXEC1, UUID_PROV1);
      const checker = new BoundaryIntegrityChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.status).toBe('pass');
    });

    it('fails when execution uses disabled provider', async () => {
      await seedProvider(UUID_PROV1, false);
      await seedExecution(UUID_EXEC1, UUID_PROV1);
      const checker = new BoundaryIntegrityChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.status).toBe('fail');
      expect(inv.defects[0].title).toContain('disabled');
    });

    it('fails with critical severity when execution uses unknown provider', async () => {
      await seedExecution(UUID_EXEC1, UUID_NONEXISTENT);
      const checker = new BoundaryIntegrityChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.status).toBe('fail');
      expect(inv.defects[0].severity).toBe('critical');
      expect(inv.defects[0].title).toContain('unknown');
    });

    it('passes with no executions', async () => {
      const checker = new BoundaryIntegrityChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.status).toBe('pass');
    });
  });

  describe('audit coherence checks', () => {
    it('detects audit event boundary coherence violation', async () => {
      // routing_xxx action should reference routing_decision or execution, not provider
      await seedAuditEvent(UUID_AE1, 'routing_decision_made', 'provider');
      const checker = new BoundaryIntegrityChecker(executionRepo, providerRepo, auditRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      expect(inv.defects.some(d => d.title.includes('coherence violation'))).toBe(true);
    });

    it('passes when audit events are coherent', async () => {
      await seedAuditEvent(UUID_AE1, 'routing_decision_made', 'routing_decision');
      const checker = new BoundaryIntegrityChecker(executionRepo, providerRepo, auditRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      const coherenceDefects = inv.defects.filter(d => d.title.includes('coherence'));
      expect(coherenceDefects).toHaveLength(0);
    });

    it('ignores audit events with unknown action prefixes', async () => {
      await seedAuditEvent(UUID_AE1, 'custom_action', 'custom_type');
      const checker = new BoundaryIntegrityChecker(executionRepo, providerRepo, auditRepo);
      const result = await checker.check('daily');
      const inv = result.invariants[0];
      const coherenceDefects = inv.defects.filter(d => d.title.includes('coherence'));
      expect(coherenceDefects).toHaveLength(0);
    });

    it('works without audit repo', async () => {
      const checker = new BoundaryIntegrityChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      expect(result.invariants).toHaveLength(1);
    });
  });
});
