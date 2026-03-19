import { describe, it, expect, beforeEach } from 'vitest';
import { DispatchRunService } from './DispatchRunService.js';
import { ExecutionStatusTracker } from './ExecutionStatusTracker.js';
import type { DispatchRunDeps } from './DispatchRunService.js';
import {
  CognitiveGrade,
  DecisionPosture,
  LoadTier,
  TaskType,
  type DispatchRunRequest,
  type RoutingRequest,
} from '@acds/core-types';

function makeRoutingRequest(): RoutingRequest {
  return {
    application: 'TestApp',
    process: 'Review',
    step: 'Analyze',
    taskType: TaskType.ANALYTICAL,
    loadTier: LoadTier.SINGLE_SHOT,
    decisionPosture: DecisionPosture.OPERATIONAL,
    cognitiveGrade: CognitiveGrade.STANDARD,
    input: 'test input',
    constraints: {
      privacy: 'cloud_allowed' as const,
      maxLatencyMs: null,
      costSensitivity: 'medium' as const,
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
  };
}

function makeDispatchRunRequest(overrides: Partial<DispatchRunRequest> = {}): DispatchRunRequest {
  return {
    routingRequest: makeRoutingRequest(),
    inputPayload: 'Hello world',
    inputFormat: 'text' as const,
    ...overrides,
  };
}

function makeRoutingDecision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'decision-1',
    selectedModelProfileId: 'model-prof-1',
    selectedTacticProfileId: 'tactic-prof-1',
    selectedProviderId: 'provider-1',
    fallbackChain: [],
    rationaleId: 'rationale-1',
    rationaleSummary: 'Selected best candidate',
    resolvedAt: new Date(),
    ...overrides,
  };
}

function makeRationale() {
  return {
    id: 'rationale-1',
    routingDecisionId: 'decision-1',
    executionFamilyKey: 'testapp:review:analyze',
    selectedProfileReason: 'Best fit',
    selectedTacticReason: 'Single pass',
    selectedProviderReason: 'Available',
    policyMatchSummary: 'All policies met',
    eligibleProfileCount: 1,
    eligibleTacticCount: 1,
    constraintsSummary: 'No constraints violated',
    createdAt: new Date(),
  };
}

function makeAdapterResponse(overrides: Record<string, unknown> = {}) {
  return {
    content: 'Response content',
    model: 'gpt-4',
    inputTokens: 100,
    outputTokens: 50,
    finishReason: 'stop' as const,
    latencyMs: 200,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<DispatchRunDeps> = {}): DispatchRunDeps {
  const decision = makeRoutingDecision();
  const rationale = makeRationale();
  const response = makeAdapterResponse();

  return {
    resolveRoute: async () => ({ decision, rationale }),
    executeProvider: async () => response,
    resolveApiKey: async () => 'test-api-key',
    resolveModelId: async () => 'gpt-4',
    ...overrides,
  };
}

describe('DispatchRunService', () => {
  let tracker: ExecutionStatusTracker;

  beforeEach(() => {
    tracker = new ExecutionStatusTracker();
  });

  it('resolves a route by delegating to deps', async () => {
    const deps = makeDeps();
    const service = new DispatchRunService(tracker, deps);

    const result = await service.resolveRoute(makeRoutingRequest() as any);
    expect(result.decision.id).toBe('decision-1');
  });

  it('runs successfully and returns a succeeded response', async () => {
    const deps = makeDeps();
    const service = new DispatchRunService(tracker, deps);

    const result = await service.run(makeDispatchRunRequest());

    expect(result.status).toBe('succeeded');
    expect(result.normalizedOutput).toBe('Response content');
    expect(result.selectedModelProfileId).toBe('model-prof-1');
    expect(result.selectedTacticProfileId).toBe('tactic-prof-1');
    expect(result.selectedProviderId).toBe('provider-1');
    expect(result.latencyMs).toBe(200);
    expect(result.fallbackUsed).toBe(false);
    expect(result.fallbackAttempts).toBe(0);
    expect(result.rationaleId).toBe('rationale-1');
    expect(result.rationaleSummary).toBe('Selected best candidate');
    expect(result.executionId).toBeTruthy();
  });

  it('marks execution as running then succeeded', async () => {
    const deps = makeDeps();
    const service = new DispatchRunService(tracker, deps);

    const result = await service.run(makeDispatchRunRequest());

    const tracked = tracker.getStatus(result.executionId);
    expect(tracked).toBeDefined();
    expect(tracked!.status).toBe('succeeded');
  });

  it('uses json responseFormat when inputFormat is json', async () => {
    let capturedRequest: any;
    const deps = makeDeps({
      executeProvider: async (_pid, req) => {
        capturedRequest = req;
        return makeAdapterResponse();
      },
    });
    const service = new DispatchRunService(tracker, deps);

    await service.run(makeDispatchRunRequest({ inputFormat: 'json' }));

    expect(capturedRequest.responseFormat).toBe('json');
  });

  it('uses text responseFormat for non-json inputFormat', async () => {
    let capturedRequest: any;
    const deps = makeDeps({
      executeProvider: async (_pid, req) => {
        capturedRequest = req;
        return makeAdapterResponse();
      },
    });
    const service = new DispatchRunService(tracker, deps);

    await service.run(makeDispatchRunRequest({ inputFormat: 'markdown' }));

    expect(capturedRequest.responseFormat).toBe('text');
  });

  it('throws and marks failed when provider fails and no fallback chain', async () => {
    const providerError = new Error('Provider timeout');
    const deps = makeDeps({
      executeProvider: async () => { throw providerError; },
    });
    const service = new DispatchRunService(tracker, deps);

    await expect(service.run(makeDispatchRunRequest())).rejects.toThrow('Provider timeout');
  });

  it('uses fallback when primary fails and fallback chain has entries', async () => {
    let callCount = 0;
    const fallbackResponse = makeAdapterResponse({ content: 'Fallback content', latencyMs: 300 });
    const decision = makeRoutingDecision({
      fallbackChain: [
        { modelProfileId: 'model-2', tacticProfileId: 'tactic-2', providerId: 'provider-2', priority: 1 },
      ],
    });
    const rationale = makeRationale();

    const deps = makeDeps({
      resolveRoute: async () => ({ decision, rationale }),
      executeProvider: async (_providerId) => {
        callCount++;
        if (callCount === 1) throw new Error('Primary failed');
        return fallbackResponse;
      },
    });
    const service = new DispatchRunService(tracker, deps);

    const result = await service.run(makeDispatchRunRequest());

    expect(result.status).toBe('fallback_succeeded');
    expect(result.normalizedOutput).toBe('Fallback content');
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackAttempts).toBeGreaterThanOrEqual(1);
  });

  it('throws when primary and all fallbacks fail', async () => {
    const decision = makeRoutingDecision({
      fallbackChain: [
        { modelProfileId: 'model-2', tacticProfileId: 'tactic-2', providerId: 'provider-2', priority: 1 },
      ],
    });
    const rationale = makeRationale();

    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const deps = makeDeps({
        resolveRoute: async () => ({ decision, rationale }),
        executeProvider: async () => { throw new Error('All providers down'); },
      });
      const service = new DispatchRunService(tracker, deps);

      await expect(service.run(makeDispatchRunRequest())).rejects.toThrow('All providers down');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('handles non-Error thrown by provider', async () => {
    const deps = makeDeps({
      executeProvider: async () => { throw 'string-error'; },
    });
    const service = new DispatchRunService(tracker, deps);

    await expect(service.run(makeDispatchRunRequest())).rejects.toBe('string-error');
  });

  it('resolves the model ID from the decision', async () => {
    let resolvedModelId: string | undefined;
    const deps = makeDeps({
      resolveModelId: async (profileId) => {
        resolvedModelId = profileId;
        return 'resolved-model';
      },
    });
    const service = new DispatchRunService(tracker, deps);

    await service.run(makeDispatchRunRequest());

    expect(resolvedModelId).toBe('model-prof-1');
  });

  it('passes the api key to executeProvider', async () => {
    let capturedApiKey: string | undefined;
    const deps = makeDeps({
      resolveApiKey: async () => 'my-secret-key',
      executeProvider: async (_pid, _req, apiKey) => {
        capturedApiKey = apiKey;
        return makeAdapterResponse();
      },
    });
    const service = new DispatchRunService(tracker, deps);

    await service.run(makeDispatchRunRequest());

    expect(capturedApiKey).toBe('my-secret-key');
  });

  it('returns outputFormat matching inputFormat', async () => {
    const deps = makeDeps();
    const service = new DispatchRunService(tracker, deps);

    const result = await service.run(makeDispatchRunRequest({ inputFormat: 'json' }));
    expect(result.outputFormat).toBe('json');
  });
});
