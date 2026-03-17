import { describe, it, expect } from 'vitest';
import { AppleIntelligenceChecker } from './AppleIntelligenceChecker.js';
import { InMemoryExecutionRecordReadRepository } from '../__test-support__/InMemoryExecutionRecordReadRepository.js';
import { InMemoryProviderRepository } from '../__test-support__/InMemoryProviderRepository.js';
import { ProviderVendor, AuthType } from '@acds/core-types';
import type { Provider, ExecutionRecord } from '@acds/core-types';

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'prov-apple-1',
    name: 'Apple Intelligence',
    vendor: ProviderVendor.APPLE,
    authType: AuthType.NONE,
    baseUrl: 'http://localhost:11435',
    enabled: true,
    environment: 'local',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeExecution(overrides: Partial<Record<string, unknown>> = {}): ExecutionRecord {
  return {
    id: 'exec-1',
    executionFamily: { application: 'test', process: 'test', step: 'test', decisionPosture: 'advisory', cognitiveGrade: 'basic' },
    routingDecisionId: 'rd-1',
    selectedModelProfileId: 'mp-apple-fast',
    selectedTacticProfileId: 'tp-1',
    selectedProviderId: 'prov-apple-1',
    status: 'succeeded' as const,
    inputTokens: 100,
    outputTokens: 200,
    latencyMs: 50,
    costEstimate: 0,
    normalizedOutput: 'test output',
    errorMessage: null,
    fallbackAttempts: 0,
    createdAt: new Date(),
    completedAt: new Date(),
    ...overrides,
  } as ExecutionRecord;
}

function createRepos(providers: Provider[] = [], executions: ExecutionRecord[] = []) {
  return {
    providerRepo: new InMemoryProviderRepository(providers),
    executionRepo: new InMemoryExecutionRecordReadRepository(executions),
  };
}

describe('AppleIntelligenceChecker', () => {
  it('should have correct name and invariant IDs', () => {
    const { providerRepo, executionRepo } = createRepos();
    const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
    expect(checker.name).toBe('AppleIntelligenceChecker');
    expect(checker.invariantIds).toEqual(['AI-001', 'AI-002', 'AI-003', 'AI-004', 'AI-005', 'AI-006']);
    expect(checker.supportedCadences).toContain('fast');
    expect(checker.supportedCadences).toContain('daily');
  });

  describe('AI-001: Bridge localhost-only', () => {
    it('passes when all Apple providers use loopback', async () => {
      const providers = [makeProvider()];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when an Apple provider uses a remote host', async () => {
      const providers = [makeProvider({ baseUrl: 'https://remote.example.com' })];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
      expect(inv.defects[0].severity).toBe('critical');
    });

    it('fails when an Apple provider has invalid baseUrl', async () => {
      const providers = [makeProvider({ baseUrl: 'not-a-url' })];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('fail');
    });
  });

  describe('AI-002: Capabilities staleness', () => {
    it('passes when providers are recently updated', async () => {
      const providers = [makeProvider()];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.status).toBe('pass');
    });

    it('warns when a provider has not been updated in over a week', async () => {
      const staleDate = new Date(Date.now() - 200 * 3600_000);
      const providers = [makeProvider({ updatedAt: staleDate })];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.status).toBe('warn');
      expect(inv.defects).toHaveLength(1);
    });

    it('skips disabled providers', async () => {
      const staleDate = new Date(Date.now() - 200 * 3600_000);
      const providers = [makeProvider({ updatedAt: staleDate, enabled: false })];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-003: Adapter config validation', () => {
    it('passes with valid loopback config', async () => {
      const providers = [makeProvider({ baseUrl: 'http://127.0.0.1:11435' })];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-003')!;
      expect(inv.status).toBe('pass');
    });

    it('fails with non-loopback config', async () => {
      const providers = [makeProvider({ baseUrl: 'https://external.com' })];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-003')!;
      expect(inv.status).toBe('fail');
    });
  });

  describe('AI-004: macOS-only platform', () => {
    it('passes on darwin with Apple executions', async () => {
      const providers = [makeProvider()];
      const executions = [makeExecution()];
      const { providerRepo, executionRepo } = createRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-004')!;
      // On macOS (darwin), this should pass
      if (process.platform === 'darwin') {
        expect(inv.status).toBe('pass');
      }
    });

    it('passes with no Apple executions regardless of platform', async () => {
      const { providerRepo, executionRepo } = createRepos([], []);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-004')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-005: Token limits', () => {
    it('passes when tokens are within limits', async () => {
      const providers = [makeProvider()];
      const executions = [makeExecution({ inputTokens: 500, outputTokens: 500 })];
      const { providerRepo, executionRepo } = createRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when tokens exceed Foundation Models limit', async () => {
      const providers = [makeProvider()];
      const executions = [makeExecution({ inputTokens: 3000, outputTokens: 2000 })];
      const { providerRepo, executionRepo } = createRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
    });

    it('handles null token values gracefully', async () => {
      const providers = [makeProvider()];
      const executions = [makeExecution({ inputTokens: null, outputTokens: null })];
      const { providerRepo, executionRepo } = createRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-006: Bridge health before dispatch', () => {
    it('passes when all executions use enabled providers', async () => {
      const providers = [makeProvider()];
      const executions = [makeExecution()];
      const { providerRepo, executionRepo } = createRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-006')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when execution routes to disabled provider', async () => {
      const providers = [makeProvider({ enabled: false })];
      const executions = [makeExecution()];
      const { providerRepo, executionRepo } = createRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-006')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
    });
  });

  describe('No Apple providers', () => {
    it('passes all invariants when no Apple providers exist', async () => {
      const { providerRepo, executionRepo } = createRepos([], []);
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
      const providers = [makeProvider({ baseUrl: 'http://[::1]:11435' })];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('pass');
    });

    it('passes with 127.0.0.1 base URL', async () => {
      const providers = [makeProvider({ baseUrl: 'http://127.0.0.1:11435' })];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-003: protocol validation', () => {
    it('fails with ftp:// protocol', async () => {
      const providers = [makeProvider({ baseUrl: 'ftp://localhost:11435' })];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-003')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects.some((d) => d.title.includes('unsafe scheme'))).toBe(true);
    });

    it('fails with invalid baseUrl for AI-003', async () => {
      const providers = [makeProvider({ baseUrl: 'not-a-url' })];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-003')!;
      expect(inv.status).toBe('fail');
    });
  });

  describe('cadence variations', () => {
    it('uses fast cadence (1 hour)', async () => {
      const { providerRepo, executionRepo } = createRepos();
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('fast');
      expect(result.cadence).toBe('fast');
    });

    it('uses release cadence (168 hours)', async () => {
      const { providerRepo, executionRepo } = createRepos();
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('release');
      expect(result.cadence).toBe('release');
    });
  });

  describe('AI-005: edge cases', () => {
    it('handles exactly at token limit (4096)', async () => {
      const providers = [makeProvider()];
      const executions = [makeExecution({ inputTokens: 2048, outputTokens: 2048 })];
      const { providerRepo, executionRepo } = createRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when one token is null but other exceeds limit', async () => {
      const providers = [makeProvider()];
      const executions = [makeExecution({ inputTokens: null, outputTokens: 5000 })];
      const { providerRepo, executionRepo } = createRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('fail');
    });
  });

  describe('AI-003: non-http/https protocol on non-loopback host', () => {
    it('detects both unsafe scheme and non-loopback in a single provider', async () => {
      const providers = [makeProvider({ baseUrl: 'ftp://remote.example.com:11435' })];
      const { providerRepo, executionRepo } = createRepos(providers);
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
      const providers = [makeProvider()];
      const executions = [makeExecution({ inputTokens: null, outputTokens: 100 })];
      const { providerRepo, executionRepo } = createRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-001: multiple providers mixed', () => {
    it('reports defects only for non-loopback providers', async () => {
      const providers = [
        makeProvider({ id: 'local-1', baseUrl: 'http://localhost:11435' }),
        makeProvider({ id: 'remote-1', baseUrl: 'https://remote.host.com' }),
      ];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
      expect(inv.defects[0].evidence.providerId).toBe('remote-1');
    });
  });

  describe('AI-002: multiple providers mixed enabled/disabled/stale', () => {
    it('only reports enabled stale providers', async () => {
      const staleDate = new Date(Date.now() - 200 * 3600_000);
      const providers = [
        makeProvider({ id: 'recent-1', enabled: true }),
        makeProvider({ id: 'stale-enabled', enabled: true, updatedAt: staleDate }),
        makeProvider({ id: 'stale-disabled', enabled: false, updatedAt: staleDate }),
      ];
      const { providerRepo, executionRepo } = createRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.defects).toHaveLength(1);
      expect(inv.defects[0].evidence.providerId).toBe('stale-enabled');
    });
  });

  describe('AI-006: multiple providers', () => {
    it('reports only disabled providers', async () => {
      const providers = [
        makeProvider({ id: 'enabled-1', enabled: true }),
        makeProvider({ id: 'disabled-1', enabled: false }),
      ];
      const executions = [
        makeExecution({ id: 'e1', selectedProviderId: 'enabled-1' }),
        makeExecution({ id: 'e2', selectedProviderId: 'disabled-1' }),
      ];
      const { providerRepo, executionRepo } = createRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-006')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
      expect(inv.defects[0].evidence.executionId).toBe('e2');
    });
  });
});
