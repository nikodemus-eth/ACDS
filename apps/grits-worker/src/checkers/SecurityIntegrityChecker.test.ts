import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { SecurityIntegrityChecker } from './SecurityIntegrityChecker.js';
import { PgAuditEventReadRepository } from '../repositories/PgAuditEventReadRepository.js';
import { PgExecutionRecordReadRepository } from '../repositories/PgExecutionRecordReadRepository.js';
import { PgRoutingDecisionReadRepository } from '../repositories/PgRoutingDecisionReadRepository.js';
import { PgProviderRepository } from '@acds/persistence-pg';
import { ProviderVendor, AuthType } from '@acds/core-types';
import { createTestPool, runMigrations, closePool, truncateAll, type PoolLike } from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;
let auditRepo: PgAuditEventReadRepository;
let executionRepo: PgExecutionRecordReadRepository;
let routingRepo: PgRoutingDecisionReadRepository;
let providerRepo: PgProviderRepository;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  auditRepo = new PgAuditEventReadRepository(pool as any);
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
const UUID_AE1   = '20000000-0000-0000-0000-000000000001';
const UUID_AE2   = '20000000-0000-0000-0000-000000000002';
const UUID_EXEC1 = '10000000-0000-0000-0000-000000000001';

async function seedProvider(id: string, baseUrl = 'https://api.openai.com') {
  await pool.query(
    `INSERT INTO providers (id, name, vendor, auth_type, base_url, enabled, environment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, 'TestProvider', ProviderVendor.OPENAI, AuthType.API_KEY, baseUrl, true, 'cloud'],
  );
}

async function seedAuditEvent(id: string, details: Record<string, unknown>) {
  await pool.query(
    `INSERT INTO audit_events (id, event_type, actor, action, resource_type, resource_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, 'system_event', 'system', 'test_action', 'provider', UUID_PROV1, JSON.stringify(details), new Date()],
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
      id, 'mp-1', 'tp-1', UUID_PROV1,
      'succeeded', 100, 200, 50, 0,
      overrides.normalizedOutput ?? 'safe output',
      overrides.errorMessage ?? null,
      0, new Date(), new Date(),
    ],
  );
}

describe('SecurityIntegrityChecker', () => {
  it('has correct metadata', () => {
    const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
    expect(checker.name).toBe('SecurityIntegrityChecker');
    expect(checker.invariantIds).toEqual(['INV-005', 'INV-006']);
    expect(checker.supportedCadences).toContain('daily');
    expect(checker.supportedCadences).toContain('release');
  });

  describe('INV-005: No secret exposure', () => {
    it('passes when no audit events exist', async () => {
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-005')!;
      expect(inv.status).toBe('pass');
      expect(inv.sampleSize).toBe(0);
    });

    it('passes when audit event details are clean', async () => {
      await seedAuditEvent(UUID_AE1, { message: 'Normal operation completed', count: 42 });
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-005')!;
      expect(inv.status).toBe('pass');
    });

    it('detects OpenAI-style API key in audit event details', async () => {
      await seedAuditEvent(UUID_AE1, { key: 'sk-abcdefghijklmnopqrstuvwxyz' });
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-005')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects[0].severity).toBe('critical');
      expect(inv.defects[0].title).toContain('secret exposure');
    });

    it('detects Bearer token in audit event details', async () => {
      await seedAuditEvent(UUID_AE1, { auth: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig' });
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-005')!;
      expect(inv.status).toBe('fail');
    });

    it('detects password value in audit event details', async () => {
      await seedAuditEvent(UUID_AE1, { password: 'supersecret123' });
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-005')!;
      expect(inv.status).toBe('fail');
    });

    it('detects PEM private key in audit event details', async () => {
      await seedAuditEvent(UUID_AE1, { cert: '-----BEGIN PRIVATE KEY-----\ndata\n-----END PRIVATE KEY-----' });
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-005')!;
      expect(inv.status).toBe('fail');
    });

    it('reports only one defect per audit event even with multiple patterns', async () => {
      await seedAuditEvent(UUID_AE1, {
        key: 'sk-abcdefghijklmnopqrstuvwxyz',
        auth: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      });
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-005')!;
      // Only one defect per event (break after first match)
      const auditDefects = inv.defects.filter(d => d.resourceType === 'audit_event');
      expect(auditDefects).toHaveLength(1);
    });

    it('detects secrets in execution errorMessage field', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { errorMessage: 'Failed with key sk-abcdefghijklmnopqrstuvwxyz' });
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo, executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-005')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects.some(d => d.title.includes('errorMessage'))).toBe(true);
    });

    it('detects secrets in execution normalizedOutput field', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { normalizedOutput: 'token="abcdef1234567890ABCD"' });
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo, executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-005')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects.some(d => d.title.includes('normalizedOutput'))).toBe(true);
    });

    it('passes when execution fields are clean', async () => {
      await seedProvider(UUID_PROV1);
      await seedExecution(UUID_EXEC1, { normalizedOutput: 'Hello world', errorMessage: null });
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo, executionRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-005')!;
      expect(inv.status).toBe('pass');
    });

    it('uses release cadence (168h window)', async () => {
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('release');
      expect(result.cadence).toBe('release');
    });
  });

  describe('INV-006: Provider endpoint safety', () => {
    it('passes when all providers use https', async () => {
      await seedProvider(UUID_PROV1, 'https://api.openai.com');
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-006')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when provider uses http', async () => {
      await seedProvider(UUID_PROV1, 'http://api.openai.com');
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-006')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects[0].severity).toBe('high');
      expect(inv.defects[0].title).toContain('unsafe scheme');
    });

    it('fails critically for non-http/https schemes', async () => {
      await seedProvider(UUID_PROV1, 'ftp://files.example.com/models');
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-006')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects[0].severity).toBe('critical');
    });

    it('fails when provider targets localhost', async () => {
      await seedProvider(UUID_PROV1, 'https://localhost:8080');
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-006')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects.some(d => d.title.includes('unsafe host'))).toBe(true);
    });

    it('fails when provider targets 127.0.0.1', async () => {
      await seedProvider(UUID_PROV1, 'https://127.0.0.1:11434');
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-006')!;
      expect(inv.status).toBe('fail');
    });

    it('fails when provider targets 0.0.0.0', async () => {
      await seedProvider(UUID_PROV1, 'https://0.0.0.0:8080');
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-006')!;
      expect(inv.status).toBe('fail');
    });

    it('fails when provider targets AWS metadata IP', async () => {
      await seedProvider(UUID_PROV1, 'https://169.254.169.254/latest/meta-data');
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-006')!;
      expect(inv.status).toBe('fail');
    });

    it('fails when provider has invalid URL', async () => {
      await seedProvider(UUID_PROV1, 'not-a-valid-url');
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-006')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects[0].title).toContain('invalid baseUrl');
    });

    it('passes with no providers', async () => {
      const checker = new SecurityIntegrityChecker(auditRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find(r => r.invariantId === 'INV-006')!;
      expect(inv.status).toBe('pass');
      expect(inv.sampleSize).toBe(0);
    });
  });
});
