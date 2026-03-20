import { describe, it, expect } from 'vitest';
import { ArtifactPipeline } from '../../../../src/artifact/pipeline/artifact-pipeline.js';
import { ArtifactEnvelopeSchema } from '../../../../src/artifact/artifact-envelope.js';
import { createDefaultArtifactRegistry, createDefaultFamilyNormalizers } from '../../../../src/artifact/default-artifact-registry.js';
import { CapabilityRegistry } from '../../../../src/registry/capability-registry.js';
import { CAPABILITY_CONTRACTS } from '../../../../src/domain/capability-taxonomy.js';
import { FREE_COST, LOCAL_LATENCY } from '../../../../src/domain/cost-types.js';
import type { CapabilityOrchestrator, CapabilityResponse } from '../../../../src/runtime/capability-orchestrator.js';
import type { CapabilityBinding } from '../../../../src/registry/capability-binding.js';

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

function makeCapabilityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  for (const contract of CAPABILITY_CONTRACTS) {
    registry.registerContract(contract);
  }
  // Bind Apple provider to all text capabilities
  for (const id of ['text.rewrite', 'text.summarize', 'text.proofread', 'text.classify', 'text.extract', 'text.generate', 'image.generate', 'image.describe', 'image.ocr', 'agent.control.decide']) {
    registry.bindProvider(makeBinding(id, 'apple-intelligence-runtime'));
  }
  return registry;
}

function makeOrchestrator(output?: unknown, shouldThrow?: Error): CapabilityOrchestrator {
  return {
    request: async () => {
      if (shouldThrow) throw shouldThrow;
      return {
        output: output ?? { rewrittenText: 'improved text' },
        metadata: {
          capabilityId: 'text.rewrite',
          capabilityVersion: '1.0',
          providerId: 'apple-intelligence-runtime',
          methodId: 'apple.writing_tools.rewrite',
          executionMode: 'local',
          deterministic: true,
          latencyMs: 25,
          costUSD: 0,
          validated: true,
        },
        decision: {
          eligibleProviders: 1,
          selectedReason: 'top scorer',
          fallbackAvailable: false,
          policyApplied: [],
        },
      } satisfies CapabilityResponse;
    },
  } as unknown as CapabilityOrchestrator;
}

function makePipeline(orchestrator?: CapabilityOrchestrator) {
  return new ArtifactPipeline({
    registry: createDefaultArtifactRegistry(),
    capabilityRegistry: makeCapabilityRegistry(),
    capabilityOrchestrator: orchestrator ?? makeOrchestrator(),
    familyNormalizers: createDefaultFamilyNormalizers(),
  });
}

describe('ArtifactPipeline', () => {
  it('produces a succeeded envelope for valid rewrite request', async () => {
    const pipeline = makePipeline();
    const envelope = await pipeline.execute(
      'ACDS.TextAssist.Rewrite.Short',
      { source_text: 'hello world' },
      { requestedBy: 'test' },
    );
    expect(envelope.status).toBe('succeeded');
    expect(envelope.artifact_type).toBe('ACDS.TextAssist.Rewrite.Short');
    expect(envelope.provider).toBe('apple-intelligence-runtime');
    expect(envelope.provider_family).toBe('apple');
    expect(envelope.execution).toBeDefined();
    const result = ArtifactEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('produces a blocked envelope for unknown artifact type', async () => {
    const pipeline = makePipeline();
    const envelope = await pipeline.execute('ACDS.Unknown.Type', {});
    expect(envelope.status).toBe('blocked');
    expect(envelope.policy.policy_trace.length).toBeGreaterThan(0);
    const result = ArtifactEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('produces a failed envelope when input validation fails', async () => {
    const pipeline = makePipeline();
    const envelope = await pipeline.execute(
      'ACDS.TextAssist.Rewrite.Short',
      { source_text: '' }, // empty text → validation error (VALIDATION_FAILED)
    );
    expect(envelope.status).toBe('failed');
    const result = ArtifactEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('produces a failed envelope when orchestrator throws', async () => {
    const pipeline = makePipeline(makeOrchestrator(undefined, new Error('provider timeout')));
    const envelope = await pipeline.execute(
      'ACDS.TextAssist.Rewrite.Short',
      { source_text: 'test' },
    );
    expect(envelope.status).toBe('failed');
    expect(envelope.provider).toBeDefined();
    const result = ArtifactEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('records timing for all executed stages', async () => {
    const pipeline = makePipeline();
    const envelope = await pipeline.execute(
      'ACDS.TextAssist.Rewrite.Short',
      { source_text: 'timing test' },
    );
    expect(envelope.execution).toBeDefined();
    expect(envelope.execution!.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('never throws — always returns an envelope', async () => {
    const pipeline = makePipeline();
    // Even with bizarre input, should not throw
    const envelope = await pipeline.execute('', null);
    expect(envelope).toBeDefined();
    expect(['blocked', 'failed']).toContain(envelope.status);
  });

  it('produces succeeded envelope for TextModel.Classify', async () => {
    const pipeline = makePipeline(makeOrchestrator({ label: 'positive', confidence: 0.9 }));
    const envelope = await pipeline.execute(
      'ACDS.TextModel.Classify',
      { text: 'This is great!', labels: ['positive', 'negative'] },
    );
    expect(envelope.status).toBe('succeeded');
  });

  it('produces succeeded envelope for Image.Generate.Stylized', async () => {
    const pipeline = makePipeline(makeOrchestrator({ artifactRef: 'file:///img.png', format: 'png', width: 512, height: 512 }));
    const envelope = await pipeline.execute(
      'ACDS.Image.Generate.Stylized',
      { prompt: 'a sunset over mountains' },
    );
    expect(envelope.status).toBe('succeeded');
    expect(envelope.output_modality).toBe('image');
  });

  it('defaults requestedBy to system when options omitted', async () => {
    const pipeline = makePipeline();
    const envelope = await pipeline.execute(
      'ACDS.TextAssist.Rewrite.Short',
      { source_text: 'test' },
    );
    expect(envelope.provenance.requested_by).toBe('system');
  });
});
