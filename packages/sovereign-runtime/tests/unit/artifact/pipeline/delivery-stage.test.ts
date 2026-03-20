import { describe, it, expect } from 'vitest';
import { DeliveryStage, assembleEnvelope } from '../../../../src/artifact/pipeline/delivery-stage.js';
import { ArtifactEnvelopeSchema, ENVELOPE_VERSION } from '../../../../src/artifact/artifact-envelope.js';
import { TEXT_ASSIST_ENTRIES } from '../../../../src/artifact/families/text-assist.js';
import type { PipelineContext } from '../../../../src/artifact/pipeline/pipeline-types.js';

function makeCompletedCtx(): PipelineContext {
  return {
    artifactType: 'ACDS.TextAssist.Rewrite.Short',
    rawInput: { source_text: 'test' },
    options: { requestedBy: 'test-user' },
    timings: { intake: 1, policy_gate: 1, planning: 2, execution: 50, post_processing: 1, provenance: 1 },
    startTime: performance.now() - 60,
    registryEntry: TEXT_ASSIST_ENTRIES[0],
    selectedProvider: 'apple-intelligence-runtime',
    selectedProviderFamily: 'apple',
    selectedMethod: 'text.rewrite',
    outputModality: 'text',
    outputFormat: 'plain_text',
    rawOutput: { rewrittenText: 'improved' },
    canonicalPayload: { primary: { text: 'improved' } },
    policyDecision: { allowed: true, tier: 'allowed', trace: ['all passed'], local_only: false },
    provenance: {
      provider_route: 'apple.apple-intelligence-runtime',
      method: 'text.rewrite',
      requested_by: 'test-user',
      execution_started_at: new Date().toISOString(),
      execution_completed_at: new Date().toISOString(),
      normalizations: ['mapped provider output into canonical TextAssist payload'],
    },
    inputSummary: { source_modality: 'text', input_class: 'text_assist_rewrite', input_size: 4, summary: 'test' },
  };
}

describe('DeliveryStage', () => {
  const stage = new DeliveryStage();

  it('executes without error and records timing', async () => {
    const ctx = makeCompletedCtx();
    await stage.execute(ctx);
    expect(ctx.timings['delivery']).toBeGreaterThanOrEqual(0);
  });
});

describe('assembleEnvelope', () => {
  it('produces a valid succeeded envelope from completed context', () => {
    const ctx = makeCompletedCtx();
    const envelope = assembleEnvelope(ctx);
    expect(envelope.status).toBe('succeeded');
    expect(envelope.envelope_version).toBe(ENVELOPE_VERSION);
    expect(envelope.artifact_type).toBe('ACDS.TextAssist.Rewrite.Short');
    expect(envelope.provider).toBe('apple-intelligence-runtime');
    expect(envelope.provider_family).toBe('apple');
    expect(envelope.payload.primary).toEqual({ text: 'improved' });
    expect(envelope.execution).toBeDefined();
    expect(envelope.execution!.fallback_used).toBe(false);

    const result = ArtifactEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('includes fallback info when fallback was used', () => {
    const ctx = makeCompletedCtx();
    ctx.fallbackUsed = true;
    ctx.fallbackProvider = 'ollama-local';
    const envelope = assembleEnvelope(ctx);
    expect(envelope.fallback).toBeDefined();
    expect(envelope.fallback!.attempted).toBe(true);
    expect(envelope.fallback!.fallback_provider).toBe('ollama-local');
  });
});
