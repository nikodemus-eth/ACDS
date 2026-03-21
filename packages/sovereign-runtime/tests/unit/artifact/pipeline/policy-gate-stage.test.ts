import { describe, it, expect } from 'vitest';
import { PolicyGateStage } from '../../../../src/artifact/pipeline/policy-gate-stage.js';
import { TEXT_ASSIST_ENTRIES } from '../../../../src/artifact/families/text-assist.js';
import type { PipelineContext } from '../../../../src/artifact/pipeline/pipeline-types.js';

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    artifactType: 'ACDS.TextAssist.Rewrite.Short',
    rawInput: {},
    options: { requestedBy: 'test' },
    timings: {},
    startTime: performance.now(),
    registryEntry: TEXT_ASSIST_ENTRIES[0],
    ...overrides,
  };
}

describe('PolicyGateStage', () => {
  const stage = new PolicyGateStage();

  it('allows artifact with valid disposition', async () => {
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.policyDecision).toBeDefined();
    expect(ctx.policyDecision!.allowed).toBe(true);
    expect(ctx.error).toBeUndefined();
  });

  it('sets error when no registry entry is present', async () => {
    const ctx = makeCtx({ registryEntry: undefined });
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('ARTIFACT_BLOCKED');
  });

  it('propagates local-only constraint in trace', async () => {
    const ctx = makeCtx({ options: { requestedBy: 'test', constraints: { localOnly: true } } });
    await stage.execute(ctx);
    expect(ctx.policyDecision!.local_only).toBe(true);
    expect(ctx.policyDecision!.trace).toContain('local-only constraint active');
  });

  it('records timing', async () => {
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.timings['policy_gate']).toBeGreaterThanOrEqual(0);
  });

  it('blocks when default provider is ineligible under apple-only disposition', async () => {
    const entry = {
      ...TEXT_ASSIST_ENTRIES[0],
      default_provider: 'ollama-local',
      provider_disposition: 'apple-only' as const,
    };
    const ctx = makeCtx({ registryEntry: entry });
    await stage.execute(ctx);
    expect(ctx.policyDecision).toBeDefined();
    expect(ctx.policyDecision!.allowed).toBe(false);
    expect(ctx.policyDecision!.blocked_reason).toContain('ollama-local');
    expect(ctx.policyDecision!.blocked_reason).toContain('apple-only');
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('ARTIFACT_BLOCKED');
  });

  it('includes trace items for standard allowed flow', async () => {
    const ctx = makeCtx();
    await stage.execute(ctx);
    const trace = ctx.policyDecision!.trace;
    expect(trace).toContain('content policy: passed');
    expect(trace).toContain('retention policy: ephemeral_preview_plus_artifact_log');
    expect(trace.some(t => t.includes('artifact class'))).toBe(true);
    expect(trace.some(t => t.includes('provider disposition'))).toBe(true);
  });

  it('sets local_only to false when no constraint specified', async () => {
    const ctx = makeCtx({ options: { requestedBy: 'test' } });
    await stage.execute(ctx);
    expect(ctx.policyDecision!.local_only).toBe(false);
  });

  it('does not include local-only trace when localOnly is false', async () => {
    const ctx = makeCtx({ options: { requestedBy: 'test', constraints: { localOnly: false } } });
    await stage.execute(ctx);
    expect(ctx.policyDecision!.trace).not.toContain('local-only constraint active');
  });

  it('sets error stage name correctly when registry entry missing', async () => {
    const ctx = makeCtx({ registryEntry: undefined });
    await stage.execute(ctx);
    expect(ctx.error!.stage).toBe('policy_gate');
  });

  it('allows apple-optional disposition with non-Apple provider', async () => {
    const entry = {
      ...TEXT_ASSIST_ENTRIES[0],
      default_provider: 'ollama-local',
      provider_disposition: 'apple-optional' as const,
    };
    const ctx = makeCtx({ registryEntry: entry });
    await stage.execute(ctx);
    expect(ctx.policyDecision!.allowed).toBe(true);
    expect(ctx.error).toBeUndefined();
  });
});
