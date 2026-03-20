import { describe, it, expect } from 'vitest';
import { PlanningStage } from '../../../../src/artifact/pipeline/planning-stage.js';
import { CapabilityRegistry } from '../../../../src/registry/capability-registry.js';
import { CAPABILITY_CONTRACTS } from '../../../../src/domain/capability-taxonomy.js';
import { TEXT_ASSIST_ENTRIES } from '../../../../src/artifact/families/text-assist.js';
import { EXPRESSION_ENTRIES } from '../../../../src/artifact/families/expression.js';
import { FREE_COST, LOCAL_LATENCY } from '../../../../src/domain/cost-types.js';
import type { CapabilityBinding } from '../../../../src/registry/capability-binding.js';
import type { PipelineContext } from '../../../../src/artifact/pipeline/pipeline-types.js';

function makeCapabilityRegistry(bindings: CapabilityBinding[] = []): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  for (const contract of CAPABILITY_CONTRACTS) {
    registry.registerContract(contract);
  }
  for (const binding of bindings) {
    registry.bindProvider(binding);
  }
  return registry;
}

function makeBinding(capabilityId: string, providerId: string): CapabilityBinding {
  return {
    capabilityId,
    capabilityVersion: '1.0',
    providerId,
    methodId: `${providerId}.${capabilityId}`,
    cost: FREE_COST,
    latency: LOCAL_LATENCY,
    reliability: 0.99,
    locality: providerId.includes('apple') ? 'local' : 'remote',
  };
}

const rewriteEntry = TEXT_ASSIST_ENTRIES[0]; // ACDS.TextAssist.Rewrite.Short

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    artifactType: rewriteEntry.artifact_type,
    rawInput: {},
    options: { requestedBy: 'test' },
    timings: {},
    startTime: performance.now(),
    registryEntry: rewriteEntry,
    capabilityId: rewriteEntry.capability_id,
    policyDecision: { allowed: true, tier: 'allowed', trace: ['ok'], local_only: false },
    ...overrides,
  };
}

describe('PlanningStage', () => {
  it('selects provider and sets method, disposition, fallback', () => {
    const capReg = makeCapabilityRegistry([
      makeBinding('text.rewrite', 'apple-intelligence-runtime'),
      makeBinding('text.rewrite', 'ollama-local'),
    ]);
    const stage = new PlanningStage(capReg);
    const ctx = makeCtx();

    return stage.execute(ctx).then(() => {
      expect(ctx.selectedProvider).toBeDefined();
      expect(ctx.selectedMethod).toBeDefined();
      expect(ctx.disposition).toBe('apple-preferred');
      expect(ctx.fallbackProvider).toBeDefined();
      expect(ctx.error).toBeUndefined();
    });
  });

  it('sets error when registryEntry is missing', async () => {
    const stage = new PlanningStage(makeCapabilityRegistry());
    const ctx = makeCtx({ registryEntry: undefined });
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('ARTIFACT_BLOCKED');
  });

  it('sets error when policy decision is not allowed', async () => {
    const stage = new PlanningStage(makeCapabilityRegistry());
    const ctx = makeCtx({
      policyDecision: { allowed: false, blocked_reason: 'test', tier: 'blocked', trace: [], local_only: false },
    });
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('ARTIFACT_BLOCKED');
  });

  it('sets error when no bindings exist for capability', async () => {
    const capReg = makeCapabilityRegistry(); // no bindings
    const stage = new PlanningStage(capReg);
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('sets error when apple-only disposition has no Apple providers', async () => {
    const capReg = makeCapabilityRegistry([
      makeBinding('image.generate', 'ollama-local'),
    ]);
    const stage = new PlanningStage(capReg);
    const inlineEntry = EXPRESSION_ENTRIES[0]; // apple-only
    const ctx = makeCtx({
      registryEntry: inlineEntry,
      capabilityId: inlineEntry.capability_id,
    });
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.message).toContain('apple-only');
  });

  it('resolves provider family as apple for Apple provider', async () => {
    const capReg = makeCapabilityRegistry([
      makeBinding('text.rewrite', 'apple-intelligence-runtime'),
    ]);
    const stage = new PlanningStage(capReg);
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.selectedProviderFamily).toBe('apple');
  });

  it('resolves provider family as ollama for non-Apple provider', async () => {
    const capReg = makeCapabilityRegistry([
      makeBinding('text.classify', 'ollama-local'),
    ]);
    const stage = new PlanningStage(capReg);
    // Use TextModel.Classify (apple-optional) so non-Apple passes disposition
    const ctx = makeCtx({
      registryEntry: {
        ...rewriteEntry,
        artifact_type: 'ACDS.TextModel.Classify',
        provider_disposition: 'apple-optional',
        capability_id: 'text.classify',
      },
      capabilityId: 'text.classify',
    });
    await stage.execute(ctx);
    expect(ctx.selectedProviderFamily).toBe('ollama');
  });

  it('does not set fallback when only one provider', async () => {
    const capReg = makeCapabilityRegistry([
      makeBinding('text.rewrite', 'apple-intelligence-runtime'),
    ]);
    const stage = new PlanningStage(capReg);
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.fallbackProvider).toBeUndefined();
  });

  it('records timing', async () => {
    const capReg = makeCapabilityRegistry([
      makeBinding('text.rewrite', 'apple-intelligence-runtime'),
    ]);
    const stage = new PlanningStage(capReg);
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.timings['planning']).toBeGreaterThanOrEqual(0);
  });
});
