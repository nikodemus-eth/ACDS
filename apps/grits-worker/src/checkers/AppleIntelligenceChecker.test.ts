import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { AppleIntelligenceChecker } from './AppleIntelligenceChecker.js';
import { PgExecutionRecordReadRepository } from '../repositories/PgExecutionRecordReadRepository.js';
import { PgProviderRepository } from '@acds/persistence-pg';
import { ProviderVendor, AuthType } from '@acds/core-types';
import type { Provider } from '@acds/core-types';
import { createTestPool, runMigrations, closePool, truncateAll, type PoolLike } from '../../../../tests/__test-support__/pglitePool.js';

// Deterministic UUIDs for test providers and execution records
const UUID_PROV_APPLE_1  = '00000000-0000-0000-0000-000000000001';
const UUID_LOCAL_1       = '00000000-0000-0000-0000-000000000002';
const UUID_REMOTE_1      = '00000000-0000-0000-0000-000000000003';
const UUID_RECENT_1      = '00000000-0000-0000-0000-000000000004';
const UUID_STALE_ENABLED = '00000000-0000-0000-0000-000000000005';
const UUID_STALE_DISABLED= '00000000-0000-0000-0000-000000000006';
const UUID_ENABLED_1     = '00000000-0000-0000-0000-000000000007';
const UUID_DISABLED_1    = '00000000-0000-0000-0000-000000000008';
const UUID_EXEC_1        = '00000000-0000-0000-0000-0000000000e1';
const UUID_EXEC_2        = '00000000-0000-0000-0000-0000000000e2';

let pool: PoolLike;
let providerRepo: PgProviderRepository;
let executionRepo: PgExecutionRecordReadRepository;

function makeProvider(overrides: Partial<Provider> = {}): Omit<Provider, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: Date; updatedAt?: Date } {
  return {
    name: 'Apple Intelligence',
    vendor: ProviderVendor.APPLE,
    authType: AuthType.NONE,
    baseUrl: 'http://localhost:11435',
    enabled: true,
    environment: 'local',
    ...overrides,
  };
}

async function seedProvider(overrides: Partial<Provider> = {}): Promise<Provider> {
  const data = makeProvider(overrides);
  // Insert with explicit id if provided, otherwise let DB generate
  if (overrides.id) {
    await pool.query(
      `INSERT INTO providers (id, name, vendor, auth_type, base_url, enabled, environment, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        overrides.id,
        data.name,
        data.vendor,
        data.authType,
        data.baseUrl,
        data.enabled,
        data.environment,
        overrides.createdAt ?? new Date(),
        overrides.updatedAt ?? new Date(),
      ],
    );
    const result = await pool.query('SELECT * FROM providers WHERE id = $1', [overrides.id]);
    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: row.id as string,
      name: row.name as string,
      vendor: row.vendor as ProviderVendor,
      authType: row.auth_type as AuthType,
      baseUrl: row.base_url as string,
      enabled: row.enabled as boolean,
      environment: row.environment as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
  return providerRepo.create(data);
}

async function seedExecution(overrides: Partial<Record<string, unknown>> = {}): Promise<void> {
  const exec = {
    id: overrides.id ?? UUID_EXEC_1,
    application: 'test',
    process: 'test',
    step: 'test',
    decision_posture: 'advisory',
    cognitive_grade: 'basic',
    routing_decision_id: 'rd-1',
    selected_model_profile_id: overrides.selectedModelProfileId ?? 'mp-apple-fast',
    selected_tactic_profile_id: 'tp-1',
    selected_provider_id: overrides.selectedProviderId ?? UUID_PROV_APPLE_1,
    status: overrides.status ?? 'succeeded',
    input_tokens: overrides.inputTokens !== undefined ? overrides.inputTokens : 100,
    output_tokens: overrides.outputTokens !== undefined ? overrides.outputTokens : 200,
    latency_ms: overrides.latencyMs ?? 50,
    cost_estimate: overrides.costEstimate ?? 0,
    normalized_output: overrides.normalizedOutput ?? 'test output',
    error_message: overrides.errorMessage ?? null,
    fallback_attempts: overrides.fallbackAttempts ?? 0,
    created_at: overrides.createdAt ?? new Date(),
    completed_at: overrides.completedAt ?? new Date(),
  };
  await pool.query(
    `INSERT INTO execution_records (id, application, process, step, decision_posture, cognitive_grade, routing_decision_id, selected_model_profile_id, selected_tactic_profile_id, selected_provider_id, status, input_tokens, output_tokens, latency_ms, cost_estimate, normalized_output, error_message, fallback_attempts, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      exec.id, exec.application, exec.process, exec.step,
      exec.decision_posture, exec.cognitive_grade, exec.routing_decision_id,
      exec.selected_model_profile_id, exec.selected_tactic_profile_id,
      exec.selected_provider_id, exec.status, exec.input_tokens,
      exec.output_tokens, exec.latency_ms, exec.cost_estimate,
      exec.normalized_output, exec.error_message, exec.fallback_attempts,
      exec.created_at, exec.completed_at,
    ],
  );
}

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  const pgPool = pool as any;
  providerRepo = new PgProviderRepository(pgPool);
  executionRepo = new PgExecutionRecordReadRepository(pgPool);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

describe('AppleIntelligenceChecker', () => {
  it('should have correct name and invariant IDs', () => {
    const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
    expect(checker.name).toBe('AppleIntelligenceChecker');
    expect(checker.invariantIds).toEqual(['AI-001', 'AI-002', 'AI-003', 'AI-004', 'AI-005', 'AI-006']);
    expect(checker.supportedCadences).toContain('fast');
    expect(checker.supportedCadences).toContain('daily');
  });

  describe('AI-001: Bridge localhost-only', () => {
    it('passes when all Apple providers use loopback', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1 });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when an Apple provider uses a remote host', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1, baseUrl: 'https://remote.example.com' });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
      expect(inv.defects[0].severity).toBe('critical');
    });

    it('fails when an Apple provider has invalid baseUrl', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1, baseUrl: 'not-a-url' });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('fail');
    });
  });

  describe('AI-002: Capabilities staleness', () => {
    it('passes when providers are recently updated', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1 });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.status).toBe('pass');
    });

    it('warns when a provider has not been updated in over a week', async () => {
      const staleDate = new Date(Date.now() - 200 * 3600_000);
      await seedProvider({ id: UUID_PROV_APPLE_1, updatedAt: staleDate });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.status).toBe('warn');
      expect(inv.defects).toHaveLength(1);
    });

    it('skips disabled providers', async () => {
      const staleDate = new Date(Date.now() - 200 * 3600_000);
      await seedProvider({ id: UUID_PROV_APPLE_1, updatedAt: staleDate, enabled: false });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-003: Adapter config validation', () => {
    it('passes with valid loopback config', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1, baseUrl: 'http://127.0.0.1:11435' });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-003')!;
      expect(inv.status).toBe('pass');
    });

    it('fails with non-loopback config', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1, baseUrl: 'https://external.com' });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-003')!;
      expect(inv.status).toBe('fail');
    });
  });

  describe('AI-004: macOS-only platform', () => {
    it('passes on darwin with Apple executions', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1 });
      await seedExecution();
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-004')!;
      // On macOS (darwin), this should pass
      if (process.platform === 'darwin') {
        expect(inv.status).toBe('pass');
      }
    });

    it('passes with no Apple executions regardless of platform', async () => {
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-004')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-005: Token limits', () => {
    it('passes when tokens are within limits', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1 });
      await seedExecution({ inputTokens: 500, outputTokens: 500 });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when tokens exceed Foundation Models limit', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1 });
      await seedExecution({ inputTokens: 3000, outputTokens: 2000 });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
    });

    it('handles null token values gracefully', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1 });
      await seedExecution({ inputTokens: null, outputTokens: null });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-006: Bridge health before dispatch', () => {
    it('passes when all executions use enabled providers', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1 });
      await seedExecution();
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-006')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when execution routes to disabled provider', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1, enabled: false });
      await seedExecution();
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-006')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
    });
  });

  describe('No Apple providers', () => {
    it('passes all invariants when no Apple providers exist', async () => {
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      expect(result.invariants).toHaveLength(6);
      for (const inv of result.invariants) {
        expect(inv.status).toBe('pass');
      }
    });
  });

  describe('AI-001: additional loopback hosts', () => {
    it('passes with [::1] base URL', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1, baseUrl: 'http://[::1]:11435' });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('pass');
    });

    it('passes with 127.0.0.1 base URL', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1, baseUrl: 'http://127.0.0.1:11435' });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-003: protocol validation', () => {
    it('fails with ftp:// protocol', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1, baseUrl: 'ftp://localhost:11435' });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-003')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects.some((d) => d.title.includes('unsafe scheme'))).toBe(true);
    });

    it('fails with invalid baseUrl for AI-003', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1, baseUrl: 'not-a-url' });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-003')!;
      expect(inv.status).toBe('fail');
    });
  });

  describe('cadence variations', () => {
    it('uses fast cadence (1 hour)', async () => {
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('fast');
      expect(result.cadence).toBe('fast');
    });

    it('uses release cadence (168 hours)', async () => {
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('release');
      expect(result.cadence).toBe('release');
    });
  });

  describe('AI-005: edge cases', () => {
    it('handles exactly at token limit (4096)', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1 });
      await seedExecution({ inputTokens: 2048, outputTokens: 2048 });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when one token is null but other exceeds limit', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1 });
      await seedExecution({ inputTokens: null, outputTokens: 5000 });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('fail');
    });
  });

  describe('AI-003: non-http/https protocol on non-loopback host', () => {
    it('detects both unsafe scheme and non-loopback in a single provider', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1, baseUrl: 'ftp://remote.example.com:11435' });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-003')!;
      expect(inv.status).toBe('fail');
      // Should have both scheme and non-loopback defects
      expect(inv.defects.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('AI-005: mixed null/non-null tokens', () => {
    it('handles inputTokens null with small outputTokens (within limit)', async () => {
      await seedProvider({ id: UUID_PROV_APPLE_1 });
      await seedExecution({ inputTokens: null, outputTokens: 100 });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-001: multiple providers mixed', () => {
    it('reports defects only for non-loopback providers', async () => {
      await seedProvider({ id: UUID_LOCAL_1, baseUrl: 'http://localhost:11435' });
      await seedProvider({ id: UUID_REMOTE_1, baseUrl: 'https://remote.host.com' });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
      expect(inv.defects[0].evidence.providerId).toBe(UUID_REMOTE_1);
    });
  });

  describe('AI-002: multiple providers mixed enabled/disabled/stale', () => {
    it('only reports enabled stale providers', async () => {
      const staleDate = new Date(Date.now() - 200 * 3600_000);
      await seedProvider({ id: UUID_RECENT_1, enabled: true });
      await seedProvider({ id: UUID_STALE_ENABLED, enabled: true, updatedAt: staleDate });
      await seedProvider({ id: UUID_STALE_DISABLED, enabled: false, updatedAt: staleDate });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.defects).toHaveLength(1);
      expect(inv.defects[0].evidence.providerId).toBe(UUID_STALE_ENABLED);
    });
  });

  describe('AI-006: multiple providers', () => {
    it('reports only disabled providers', async () => {
      await seedProvider({ id: UUID_ENABLED_1, enabled: true });
      await seedProvider({ id: UUID_DISABLED_1, enabled: false });
      await seedExecution({ id: UUID_EXEC_1, selectedProviderId: UUID_ENABLED_1 });
      await seedExecution({ id: UUID_EXEC_2, selectedProviderId: UUID_DISABLED_1 });
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-006')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
      expect(inv.defects[0].evidence.executionId).toBe(UUID_EXEC_2);
    });
  });
});
