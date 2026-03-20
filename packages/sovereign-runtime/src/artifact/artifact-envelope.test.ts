import { describe, it, expect } from 'vitest';
import { ArtifactEnvelopeSchema, ENVELOPE_VERSION, generateArtifactId, createBlockedEnvelope, createFailedEnvelope, ArtifactRegistryEntrySchema, ArtifactInputSummarySchema, ArtifactPayloadSchema, ArtifactProvenanceSchema, ArtifactPolicySchema, ArtifactLimitationsSchema, ArtifactQualitySchema, ArtifactConfidenceSchema, ArtifactPreviewSchema, ArtifactExecutionSchema, ArtifactFallbackSchema, ArtifactLineageSchema } from './artifact-envelope.js';

describe('ArtifactEnvelope', () => {
  const validEnvelope = {
    envelope_version: ENVELOPE_VERSION,
    artifact_id: 'artf_test_0001',
    artifact_type: 'ACDS.TextAssist.Rewrite.Short',
    artifact_version: '1.0.0',
    status: 'succeeded' as const,
    created_at: new Date().toISOString(),
    provider: 'apple-intelligence-runtime',
    provider_family: 'apple' as const,
    output_modality: 'text' as const,
    output_format: 'plain_text' as const,
    input_summary: { source_modality: 'text', input_class: 'text_assist_rewrite', input_size: 42, summary: 'Test' },
    payload: { primary: { text: 'rewritten' } },
    provenance: { provider_route: 'apple.apple-intelligence-runtime', method: 'text.rewrite', requested_by: 'test', execution_started_at: new Date().toISOString(), execution_completed_at: new Date().toISOString(), normalizations: [] },
    policy: { provider_eligibility: 'allowed', local_only_requirement: false, content_policy_result: 'passed', consent_required: false, retention_policy: 'ephemeral_preview_plus_artifact_log', policy_trace: ['test'] },
    limitations: { quality_tier: 'consumer_demo_grade' as const, known_constraints: [] },
  };

  it('generates unique IDs', () => {
    const id1 = generateArtifactId();
    const id2 = generateArtifactId();
    expect(id1).toMatch(/^artf_/);
    expect(id1).not.toBe(id2);
  });

  it('ENVELOPE_VERSION is 1.0.0', () => {
    expect(ENVELOPE_VERSION).toBe('1.0.0');
  });

  it('accepts valid envelope', () => {
    expect(ArtifactEnvelopeSchema.safeParse(validEnvelope).success).toBe(true);
  });

  it('rejects missing artifact_id', () => {
    const { artifact_id: _, ...invalid } = validEnvelope;
    expect(ArtifactEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects invalid status', () => {
    expect(ArtifactEnvelopeSchema.safeParse({ ...validEnvelope, status: 'invalid' }).success).toBe(false);
  });

  it('rejects invalid output_modality', () => {
    expect(ArtifactEnvelopeSchema.safeParse({ ...validEnvelope, output_modality: 'video' }).success).toBe(false);
  });

  it('accepts optional layers', () => {
    const withOptionals = {
      ...validEnvelope,
      quality: { score: 0.8, dimensions: { coherence: 0.9 }, evaluator: 'auto' },
      execution: { duration_ms: 150, fallback_used: false, retries: 0 },
      confidence: { overall: 0.95, basis: 'model' },
      preview: { text_excerpt: 'test' },
      fallback: { attempted: false },
      lineage: { child_artifact_ids: [] },
      safety_flags: ['safe'],
      tags: ['test'],
    };
    expect(ArtifactEnvelopeSchema.safeParse(withOptionals).success).toBe(true);
  });

  it('createBlockedEnvelope produces valid envelope', () => {
    const envelope = createBlockedEnvelope('ACDS.TextAssist.Rewrite.Short', '1.0.0', 'Policy blocked', ['trace']);
    expect(envelope.status).toBe('blocked');
    expect(envelope.provider).toBe('none');
    expect(ArtifactEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('createFailedEnvelope produces valid envelope', () => {
    const envelope = createFailedEnvelope('ACDS.TextModel.Classify', '1.0.0', 'Timeout', 'apple-intelligence-runtime', 'apple');
    expect(envelope.status).toBe('failed');
    expect(envelope.provider).toBe('apple-intelligence-runtime');
    expect(ArtifactEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('sub-schemas validate correctly', () => {
    expect(ArtifactInputSummarySchema.safeParse({ source_modality: 'text', input_class: 'x', input_size: 10, summary: 'y' }).success).toBe(true);
    expect(ArtifactPayloadSchema.safeParse({ primary: {} }).success).toBe(true);
    expect(ArtifactProvenanceSchema.safeParse({ provider_route: 'a', method: 'b', requested_by: 'c', execution_started_at: 'x', execution_completed_at: 'y', normalizations: [] }).success).toBe(true);
    expect(ArtifactPolicySchema.safeParse({ provider_eligibility: 'a', local_only_requirement: false, content_policy_result: 'p', consent_required: false, retention_policy: 'r', policy_trace: [] }).success).toBe(true);
    expect(ArtifactLimitationsSchema.safeParse({ quality_tier: 'none', known_constraints: [] }).success).toBe(true);
    expect(ArtifactQualitySchema.safeParse({ score: 0.5, dimensions: { a: 0.5 }, evaluator: 'auto' }).success).toBe(true);
    expect(ArtifactConfidenceSchema.safeParse({ overall: 0.9, basis: 'test' }).success).toBe(true);
    expect(ArtifactPreviewSchema.safeParse({}).success).toBe(true);
    expect(ArtifactExecutionSchema.safeParse({ duration_ms: 100, fallback_used: false, retries: 0 }).success).toBe(true);
    expect(ArtifactFallbackSchema.safeParse({ attempted: true }).success).toBe(true);
    expect(ArtifactLineageSchema.safeParse({ child_artifact_ids: [] }).success).toBe(true);
  });
});
