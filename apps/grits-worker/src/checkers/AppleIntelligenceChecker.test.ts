import { describe, it, expect, vi } from 'vitest';
import { AppleIntelligenceChecker } from './AppleIntelligenceChecker.js';
import type { ExecutionRecordReadRepository } from '@acds/grits';
import type { ProviderRepository } from '@acds/provider-broker';
import { ProviderVendor, AuthType } from '@acds/core-types';
import type { Provider } from '@acds/core-types';

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

function makeExecution(overrides: Partial<Record<string, unknown>> = {}) {
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
  };
}

function createMockRepos(providers: Provider[] = [], executions: ReturnType<typeof makeExecution>[] = []) {
  const providerRepo: ProviderRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue(providers),
    findByVendor: vi.fn().mockResolvedValue(providers),
    findEnabled: vi.fn(),
    update: vi.fn(),
    disable: vi.fn(),
    delete: vi.fn(),
  };
  const executionRepo: ExecutionRecordReadRepository = {
    findById: vi.fn(),
    findByTimeRange: vi.fn().mockResolvedValue(executions),
    findByFamily: vi.fn(),
  };
  return { providerRepo, executionRepo };
}

describe('AppleIntelligenceChecker', () => {
  it('should have correct name and invariant IDs', () => {
    const { providerRepo, executionRepo } = createMockRepos();
    const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
    expect(checker.name).toBe('AppleIntelligenceChecker');
    expect(checker.invariantIds).toEqual(['AI-001', 'AI-002', 'AI-003', 'AI-004', 'AI-005', 'AI-006']);
    expect(checker.supportedCadences).toContain('fast');
    expect(checker.supportedCadences).toContain('daily');
  });

  describe('AI-001: Bridge localhost-only', () => {
    it('passes when all Apple providers use loopback', async () => {
      const providers = [makeProvider()];
      const { providerRepo, executionRepo } = createMockRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when an Apple provider uses a remote host', async () => {
      const providers = [makeProvider({ baseUrl: 'https://remote.example.com' })];
      const { providerRepo, executionRepo } = createMockRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
      expect(inv.defects[0].severity).toBe('critical');
    });

    it('fails when an Apple provider has invalid baseUrl', async () => {
      const providers = [makeProvider({ baseUrl: 'not-a-url' })];
      const { providerRepo, executionRepo } = createMockRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-001')!;
      expect(inv.status).toBe('fail');
    });
  });

  describe('AI-002: Capabilities staleness', () => {
    it('passes when providers are recently updated', async () => {
      const providers = [makeProvider()];
      const { providerRepo, executionRepo } = createMockRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.status).toBe('pass');
    });

    it('warns when a provider has not been updated in over a week', async () => {
      const staleDate = new Date(Date.now() - 200 * 3600_000);
      const providers = [makeProvider({ updatedAt: staleDate })];
      const { providerRepo, executionRepo } = createMockRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.status).toBe('warn');
      expect(inv.defects).toHaveLength(1);
    });

    it('skips disabled providers', async () => {
      const staleDate = new Date(Date.now() - 200 * 3600_000);
      const providers = [makeProvider({ updatedAt: staleDate, enabled: false })];
      const { providerRepo, executionRepo } = createMockRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-002')!;
      expect(inv.status).toBe('pass');
    });
  });

  describe('AI-003: Adapter config validation', () => {
    it('passes with valid loopback config', async () => {
      const providers = [makeProvider({ baseUrl: 'http://127.0.0.1:11435' })];
      const { providerRepo, executionRepo } = createMockRepos(providers);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-003')!;
      expect(inv.status).toBe('pass');
    });

    it('fails with non-loopback config', async () => {
      const providers = [makeProvider({ baseUrl: 'https://external.com' })];
      const { providerRepo, executionRepo } = createMockRepos(providers);
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
      const { providerRepo, executionRepo } = createMockRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-004')!;
      // On macOS (darwin), this should pass
      if (process.platform === 'darwin') {
        expect(inv.status).toBe('pass');
      }
    });

    it('passes with no Apple executions regardless of platform', async () => {
      const { providerRepo, executionRepo } = createMockRepos([], []);
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
      const { providerRepo, executionRepo } = createMockRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when tokens exceed Foundation Models limit', async () => {
      const providers = [makeProvider()];
      const executions = [makeExecution({ inputTokens: 3000, outputTokens: 2000 })];
      const { providerRepo, executionRepo } = createMockRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-005')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
    });

    it('handles null token values gracefully', async () => {
      const providers = [makeProvider()];
      const executions = [makeExecution({ inputTokens: null, outputTokens: null })];
      const { providerRepo, executionRepo } = createMockRepos(providers, executions);
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
      const { providerRepo, executionRepo } = createMockRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-006')!;
      expect(inv.status).toBe('pass');
    });

    it('fails when execution routes to disabled provider', async () => {
      const providers = [makeProvider({ enabled: false })];
      const executions = [makeExecution()];
      const { providerRepo, executionRepo } = createMockRepos(providers, executions);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      const inv = result.invariants.find((r) => r.invariantId === 'AI-006')!;
      expect(inv.status).toBe('fail');
      expect(inv.defects).toHaveLength(1);
    });
  });

  describe('No Apple providers', () => {
    it('passes all invariants when no Apple providers exist', async () => {
      const { providerRepo, executionRepo } = createMockRepos([], []);
      const checker = new AppleIntelligenceChecker(executionRepo, providerRepo);
      const result = await checker.check('daily');
      expect(result.invariants).toHaveLength(6);
      for (const inv of result.invariants) {
        expect(inv.status).toBe('pass');
      }
    });
  });
});
