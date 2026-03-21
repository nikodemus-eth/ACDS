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

  it('does not include fallback section when fallback was not used', () => {
    const ctx = makeCompletedCtx();
    ctx.fallbackUsed = false;
    const envelope = assembleEnvelope(ctx);
    expect(envelope.fallback).toBeUndefined();
  });

  it('uses defaults when registryEntry is missing', () => {
    const ctx = makeCompletedCtx();
    ctx.registryEntry = undefined;
    const envelope = assembleEnvelope(ctx);
    expect(envelope.artifact_version).toBe('0.0.0');
    expect(envelope.limitations.quality_tier).toBe('consumer_demo_grade');
    expect(envelope.limitations.known_constraints).toContain('unregistered artifact type');
  });

  it('uses defaults when optional context fields are missing', () => {
    const ctx = makeCompletedCtx();
    ctx.selectedProvider = undefined;
    ctx.selectedProviderFamily = undefined;
    ctx.outputModality = undefined;
    ctx.outputFormat = undefined;
    ctx.inputSummary = undefined;
    ctx.canonicalPayload = undefined;
    ctx.provenance = undefined;
    ctx.policyDecision = undefined;
    const envelope = assembleEnvelope(ctx);
    expect(envelope.provider).toBe('unknown');
    expect(envelope.provider_family).toBe('custom');
    expect(envelope.output_modality).toBe('text');
    expect(envelope.output_format).toBe('plain_text');
    expect(envelope.input_summary.source_modality).toBe('unknown');
    expect(envelope.provenance.provider_route).toBe('unknown');
    expect(envelope.policy.provider_eligibility).toBe('blocked');
    expect(envelope.policy.policy_trace).toEqual([]);
  });

  it('sums timing values for execution duration_ms', () => {
    const ctx = makeCompletedCtx();
    ctx.timings = { intake: 10, policy_gate: 5, planning: 15, execution: 100, post_processing: 3, provenance: 2 };
    const envelope = assembleEnvelope(ctx);
    expect(envelope.execution!.duration_ms).toBe(135);
  });

  it('uses rawOutput in payload when canonicalPayload is undefined', () => {
    const ctx = makeCompletedCtx();
    ctx.canonicalPayload = undefined;
    ctx.rawOutput = { raw: 'data' };
    const envelope = assembleEnvelope(ctx);
    expect(envelope.payload.primary).toEqual({ raw: 'data' });
  });

  it('sets policy.local_only_requirement from policyDecision', () => {
    const ctx = makeCompletedCtx();
    ctx.policyDecision = { allowed: true, tier: 'allowed', trace: [], local_only: true };
    const envelope = assembleEnvelope(ctx);
    expect(envelope.policy.local_only_requirement).toBe(true);
  });

  it('uses requestedBy from options in provenance when provenance is missing', () => {
    const ctx = makeCompletedCtx();
    ctx.provenance = undefined;
    ctx.options = { requestedBy: 'custom-user' };
    const envelope = assembleEnvelope(ctx);
    expect(envelope.provenance.requested_by).toBe('custom-user');
  });

  it('defaults requestedBy to system when options has no requestedBy', () => {
    const ctx = makeCompletedCtx();
    ctx.provenance = undefined;
    ctx.options = {};
    const envelope = assembleEnvelope(ctx);
    expect(envelope.provenance.requested_by).toBe('system');
  });
});
