// ---------------------------------------------------------------------------
// Integration Tests – Fallback Execution
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import type { RoutingDecision, FallbackEntry } from '@acds/core-types';
import type { AdapterRequest, AdapterResponse } from '@acds/provider-adapters';
import {
  FallbackExecutionService,
  FallbackDecisionTracker,
  ExecutionStatusTracker,
} from '@acds/execution-orchestrator';
import type { FallbackExecutionDeps } from '@acds/execution-orchestrator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDecision(fallbackChain: FallbackEntry[]): RoutingDecision {
  return {
    id: 'decision-001',
    selectedModelProfileId: 'profile-primary',
    selectedTacticProfileId: 'tactic-1',
    selectedProviderId: 'provider-primary',
    fallbackChain,
    rationaleId: 'rationale-001',
    rationaleSummary: 'Primary selection with fallback chain',
    resolvedAt: new Date(),
  };
}

function makeAdapterRequest(): AdapterRequest {
  return {
    prompt: 'Analyze the governance posture for this scenario.',
    model: 'profile-primary',
  };
}

function successResponse(content: string): AdapterResponse {
  return {
    content,
    model: 'fallback-model',
    inputTokens: 80,
    outputTokens: 40,
    finishReason: 'stop',
    latencyMs: 150,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Fallback Execution – Chain Invocation', () => {
  let statusTracker: ExecutionStatusTracker;
  let fallbackTracker: FallbackDecisionTracker;

  beforeEach(() => {
    statusTracker = new ExecutionStatusTracker();
    fallbackTracker = new FallbackDecisionTracker();
  });

  it('invokes fallback chain when primary fails and fallback succeeds', async () => {
    const fallbackChain: FallbackEntry[] = [
      { modelProfileId: 'profile-fallback-1', tacticProfileId: 'tactic-1', providerId: 'provider-fb1', priority: 1 },
    ];
    const decision = makeDecision(fallbackChain);

    const deps: FallbackExecutionDeps = {
      executeProvider: async (_providerId: string, _request: AdapterRequest) => {
        return successResponse('Fallback analysis result');
      },
      resolveApiKey: async () => undefined,
      resolveModelId: async (modelProfileId: string) => `resolved-${modelProfileId}`,
    };

    const service = new FallbackExecutionService(statusTracker, fallbackTracker, deps);

    // Create and set up an execution ID
    const executionId = await statusTracker.create(decision, {} as any);
    await statusTracker.markRunning(executionId);

    const result = await service.executeFallbacks(
      executionId,
      decision,
      makeAdapterRequest(),
      'Primary provider connection failed',
    );

    expect(result).not.toBeNull();
    expect(result!.content).toBe('Fallback analysis result');
    expect(result!.finishReason).toBe('stop');
  });

  it('records fallback_succeeded status', async () => {
    const fallbackChain: FallbackEntry[] = [
      { modelProfileId: 'profile-fb', tacticProfileId: 'tactic-1', providerId: 'provider-fb', priority: 1 },
    ];
    const decision = makeDecision(fallbackChain);

    const deps: FallbackExecutionDeps = {
      executeProvider: async () => successResponse('Recovery content'),
      resolveApiKey: async () => undefined,
      resolveModelId: async (modelProfileId: string) => `resolved-${modelProfileId}`,
    };

    const service = new FallbackExecutionService(statusTracker, fallbackTracker, deps);
    const executionId = await statusTracker.create(decision, {} as any);
    await statusTracker.markRunning(executionId);

    await service.executeFallbacks(executionId, decision, makeAdapterRequest(), 'Primary failed');

    const status = statusTracker.getStatus(executionId);
    expect(status).toBeDefined();
    expect(status!.status).toBe('fallback_succeeded');
  });

  it('tries all fallbacks and returns null when all fail', async () => {
    const fallbackChain: FallbackEntry[] = [
      { modelProfileId: 'fb-1', tacticProfileId: 'tactic-1', providerId: 'prov-fb1', priority: 1 },
      { modelProfileId: 'fb-2', tacticProfileId: 'tactic-1', providerId: 'prov-fb2', priority: 2 },
    ];
    const decision = makeDecision(fallbackChain);

    const deps: FallbackExecutionDeps = {
      executeProvider: async () => {
        throw new Error('All providers are down');
      },
      resolveApiKey: async () => undefined,
      resolveModelId: async (modelProfileId: string) => `resolved-${modelProfileId}`,
    };

    const service = new FallbackExecutionService(statusTracker, fallbackTracker, deps);
    const executionId = await statusTracker.create(decision, {} as any);
    await statusTracker.markRunning(executionId);

    const result = await service.executeFallbacks(
      executionId,
      decision,
      makeAdapterRequest(),
      'Primary failed',
    );

    expect(result).toBeNull();

    const status = statusTracker.getStatus(executionId);
    expect(status!.status).toBe('fallback_failed');
  });

  it('returns null immediately when fallback chain is empty', async () => {
    const decision = makeDecision([]);

    const deps: FallbackExecutionDeps = {
      executeProvider: async () => {
        throw new Error('Should not be called');
      },
      resolveApiKey: async () => undefined,
      resolveModelId: async (modelProfileId: string) => `resolved-${modelProfileId}`,
    };

    const service = new FallbackExecutionService(statusTracker, fallbackTracker, deps);
    const executionId = await statusTracker.create(decision, {} as any);

    const result = await service.executeFallbacks(
      executionId,
      decision,
      makeAdapterRequest(),
      'Primary failed',
    );

    expect(result).toBeNull();
  });

  it('records fallback attempts in the tracker', async () => {
    const fallbackChain: FallbackEntry[] = [
      { modelProfileId: 'fb-fail', tacticProfileId: 'tactic-1', providerId: 'prov-fail', priority: 1 },
      { modelProfileId: 'fb-ok', tacticProfileId: 'tactic-1', providerId: 'prov-ok', priority: 2 },
    ];
    const decision = makeDecision(fallbackChain);

    let callCount = 0;
    const deps: FallbackExecutionDeps = {
      executeProvider: async () => {
        callCount++;
        if (callCount === 1) throw new Error('First fallback failed');
        return successResponse('Second fallback succeeded');
      },
      resolveApiKey: async () => undefined,
      resolveModelId: async (modelProfileId: string) => `resolved-${modelProfileId}`,
    };

    const service = new FallbackExecutionService(statusTracker, fallbackTracker, deps);
    const executionId = await statusTracker.create(decision, {} as any);
    await statusTracker.markRunning(executionId);

    await service.executeFallbacks(executionId, decision, makeAdapterRequest(), 'Primary failed');

    const attempts = fallbackTracker.getAttempts(executionId);
    expect(attempts.length).toBeGreaterThanOrEqual(3); // attempt + fail for first, attempt + success for second
    expect(attempts.some((a) => a.status === 'failed')).toBe(true);
    expect(attempts.some((a) => a.status === 'succeeded')).toBe(true);
  });
});
