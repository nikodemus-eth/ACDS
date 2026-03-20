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
});
