import { describe, it, expect } from 'vitest';
import { FallbackExecutionService } from './FallbackExecutionService.js';
import { FallbackDecisionTracker } from './FallbackDecisionTracker.js';
import { ExecutionStatusTracker } from '../run/ExecutionStatusTracker.js';
import type { FallbackExecutionDeps } from './FallbackExecutionService.js';
import type { RoutingDecision } from '@acds/core-types';

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    id: 'dec-1',
    selectedModelProfileId: 'model-1',
    selectedTacticProfileId: 'tactic-1',
    selectedProviderId: 'provider-1',
    fallbackChain: [],
    rationaleId: 'rat-1',
    rationaleSummary: 'summary',
    resolvedAt: new Date(),
    ...overrides,
  };
}

function makeAdapterRequest() {
  return {
    model: 'gpt-4',
    messages: [{ role: 'user' as const, content: 'test' }],
    maxTokens: 100,
  };
}

function makeAdapterResponse(overrides: Record<string, unknown> = {}) {
  return {
    content: 'Fallback response',
    model: 'gpt-4',
    inputTokens: 50,
    outputTokens: 25,
    finishReason: 'stop' as const,
    latencyMs: 150,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<FallbackExecutionDeps> = {}): FallbackExecutionDeps {
  return {
    executeProvider: async () => makeAdapterResponse(),
    resolveApiKey: async () => 'test-key',
    resolveModelId: async () => 'resolved-model',
    ...overrides,
  };
}

describe('FallbackExecutionService', () => {
  it('returns null when fallback chain is empty', async () => {
    const tracker = new ExecutionStatusTracker();
    const fallbackTracker = new FallbackDecisionTracker();
    const service = new FallbackExecutionService(tracker, fallbackTracker, makeDeps());

    const decision = makeDecision({ fallbackChain: [] });
    const result = await service.executeFallbacks('exec-1', decision, makeAdapterRequest() as any, 'primary failed');

    expect(result).toBeNull();
    expect(fallbackTracker.getAttempts('exec-1')).toHaveLength(0);
  });

  it('returns response from first successful fallback', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, {} as any);
    const fallbackTracker = new FallbackDecisionTracker();
    const service = new FallbackExecutionService(tracker, fallbackTracker, makeDeps());

    const decision = makeDecision({
      fallbackChain: [
        { modelProfileId: 'model-2', tacticProfileId: 'tactic-2', providerId: 'prov-2', priority: 1 },
      ],
    });

    const result = await service.executeFallbacks(id, decision, makeAdapterRequest() as any, 'primary failed');

    expect(result).not.toBeNull();
    expect(result!.content).toBe('Fallback response');
    expect(tracker.getStatus(id)?.status).toBe('fallback_succeeded');

    const attempts = fallbackTracker.getAttempts(id);
    expect(attempts).toHaveLength(2); // attempted + succeeded
    expect(attempts[0].status).toBe('attempted');
    expect(attempts[1].status).toBe('succeeded');
  });

  it('tries next fallback when first fails', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, {} as any);
    const fallbackTracker = new FallbackDecisionTracker();
    let callCount = 0;

    const deps = makeDeps({
      executeProvider: async () => {
        callCount++;
        if (callCount === 1) throw new Error('First fallback failed');
        return makeAdapterResponse({ content: 'Second fallback' });
      },
    });
    const service = new FallbackExecutionService(tracker, fallbackTracker, deps);

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const decision = makeDecision({
        fallbackChain: [
          { modelProfileId: 'model-2', tacticProfileId: 'tactic-2', providerId: 'prov-2', priority: 1 },
          { modelProfileId: 'model-3', tacticProfileId: 'tactic-3', providerId: 'prov-3', priority: 2 },
        ],
      });

      const result = await service.executeFallbacks(id, decision, makeAdapterRequest() as any, 'primary failed');

      expect(result).not.toBeNull();
      expect(result!.content).toBe('Second fallback');
      expect(tracker.getStatus(id)?.status).toBe('fallback_succeeded');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('returns null and marks fallback_failed when all fallbacks fail', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, {} as any);
    const fallbackTracker = new FallbackDecisionTracker();

    const deps = makeDeps({
      executeProvider: async () => { throw new Error('All down'); },
    });
    const service = new FallbackExecutionService(tracker, fallbackTracker, deps);

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const decision = makeDecision({
        fallbackChain: [
          { modelProfileId: 'model-2', tacticProfileId: 'tactic-2', providerId: 'prov-2', priority: 1 },
          { modelProfileId: 'model-3', tacticProfileId: 'tactic-3', providerId: 'prov-3', priority: 2 },
        ],
      });

      const result = await service.executeFallbacks(id, decision, makeAdapterRequest() as any, 'primary failed');

      expect(result).toBeNull();
      expect(tracker.getStatus(id)?.status).toBe('fallback_failed');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('handles non-Error thrown by provider', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, {} as any);
    const fallbackTracker = new FallbackDecisionTracker();

    const deps = makeDeps({
      executeProvider: async () => { throw 'string-error'; },
    });
    const service = new FallbackExecutionService(tracker, fallbackTracker, deps);

    const originalConsoleError = console.error;
    const capturedErrors: unknown[] = [];
    console.error = (...args: unknown[]) => capturedErrors.push(args);

    try {
      const decision = makeDecision({
        fallbackChain: [
          { modelProfileId: 'model-2', tacticProfileId: 'tactic-2', providerId: 'prov-2', priority: 1 },
        ],
      });

      const result = await service.executeFallbacks(id, decision, makeAdapterRequest() as any, 'primary failed');

      expect(result).toBeNull();
      // Should have logged with 'Unknown' for non-Error
      const failedAttempts = fallbackTracker.getAttempts(id).filter((a) => a.status === 'failed');
      expect(failedAttempts).toHaveLength(1);
      expect(failedAttempts[0].reason).toBe('Unknown');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('resolves api key and model for each fallback entry', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, {} as any);
    const fallbackTracker = new FallbackDecisionTracker();

    const resolvedKeys: string[] = [];
    const resolvedModels: string[] = [];

    const deps = makeDeps({
      resolveApiKey: async (providerId) => {
        resolvedKeys.push(providerId);
        return 'key-for-' + providerId;
      },
      resolveModelId: async (modelProfileId) => {
        resolvedModels.push(modelProfileId);
        return 'model-for-' + modelProfileId;
      },
      executeProvider: async (_pid, req, apiKey) => {
        return makeAdapterResponse();
      },
    });
    const service = new FallbackExecutionService(tracker, fallbackTracker, deps);

    const decision = makeDecision({
      fallbackChain: [
        { modelProfileId: 'model-fb', tacticProfileId: 'tactic-fb', providerId: 'prov-fb', priority: 1 },
      ],
    });

    await service.executeFallbacks(id, decision, makeAdapterRequest() as any, 'err');

    expect(resolvedKeys).toEqual(['prov-fb']);
    expect(resolvedModels).toEqual(['model-fb']);
  });
});
