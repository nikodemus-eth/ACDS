import { describe, it, expect } from 'vitest';
import { ExecutionStage } from '../../../../src/artifact/pipeline/execution-stage.js';
import type { CapabilityOrchestrator, CapabilityResponse } from '../../../../src/runtime/capability-orchestrator.js';
import type { PipelineContext } from '../../../../src/artifact/pipeline/pipeline-types.js';

function makeResponse(overrides: Partial<CapabilityResponse> = {}): CapabilityResponse {
  return {
    output: { rewrittenText: 'improved text' },
    metadata: {
      capabilityId: 'text.rewrite',
      capabilityVersion: '1.0',
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.writing_tools.rewrite',
      executionMode: 'local',
      deterministic: true,
      latencyMs: 42,
      costUSD: 0,
      validated: true,
      ...overrides.metadata,
    },
    decision: {
      eligibleProviders: 1,
      selectedReason: 'top scorer',
      fallbackAvailable: false,
      policyApplied: [],
      ...overrides.decision,
    },
  };
}

function makeOrchestrator(response?: CapabilityResponse, error?: Error): CapabilityOrchestrator {
  return {
    request: async () => {
      if (error) throw error;
      return response ?? makeResponse();
    },
  } as unknown as CapabilityOrchestrator;
}

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    artifactType: 'ACDS.TextAssist.Rewrite.Short',
    rawInput: {},
    options: { requestedBy: 'test' },
    timings: {},
    startTime: performance.now(),
    capabilityId: 'text.rewrite',
    normalizedInput: { text: 'hello' },
    selectedProvider: 'apple-intelligence-runtime',
    ...overrides,
  };
}

describe('ExecutionStage', () => {
  it('delegates to orchestrator and extracts metadata', async () => {
    const stage = new ExecutionStage(makeOrchestrator());
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.rawOutput).toEqual({ rewrittenText: 'improved text' });
    expect(ctx.executionLatencyMs).toBe(42);
    expect(ctx.executionMode).toBe('local');
    expect(ctx.selectedProvider).toBe('apple-intelligence-runtime');
    expect(ctx.selectedMethod).toBe('apple.writing_tools.rewrite');
    expect(ctx.error).toBeUndefined();
  });

  it('sets error when capabilityId is missing', async () => {
    const stage = new ExecutionStage(makeOrchestrator());
    const ctx = makeCtx({ capabilityId: undefined });
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('ARTIFACT_BLOCKED');
  });

  it('sets error when normalizedInput is missing', async () => {
    const stage = new ExecutionStage(makeOrchestrator());
    const ctx = makeCtx({ normalizedInput: undefined });
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('ARTIFACT_BLOCKED');
  });

  it('preserves existing error from prior stage', async () => {
    const stage = new ExecutionStage(makeOrchestrator());
    const priorError = { stage: 'planning', message: 'no bindings', code: 'PROVIDER_UNAVAILABLE' };
    const ctx = makeCtx({ error: priorError });
    await stage.execute(ctx);
    expect(ctx.error).toEqual(priorError);
    expect(ctx.rawOutput).toBeUndefined();
  });

  it('catches orchestrator error and sets PROVIDER_UNAVAILABLE', async () => {
    const stage = new ExecutionStage(makeOrchestrator(undefined, new Error('connection refused')));
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('PROVIDER_UNAVAILABLE');
    expect(ctx.error!.message).toBe('connection refused');
  });

  it('catches non-Error throw', async () => {
    const orchestrator = {
      request: async () => { throw 'string error'; },
    } as unknown as CapabilityOrchestrator;
    const stage = new ExecutionStage(orchestrator);
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.message).toBe('Execution failed');
  });

  it('records timing', async () => {
    const stage = new ExecutionStage(makeOrchestrator());
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.timings['execution']).toBeGreaterThanOrEqual(0);
  });
});
