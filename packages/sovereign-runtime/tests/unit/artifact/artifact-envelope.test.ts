import { describe, it, expect } from 'vitest';
import {
  ArtifactEnvelopeSchema,
  ENVELOPE_VERSION,
  generateArtifactId,
  createBlockedEnvelope,
  createFailedEnvelope,
} from '../../../src/artifact/artifact-envelope.js';

describe('ArtifactEnvelope', () => {
  describe('generateArtifactId', () => {
    it('produces unique IDs with artf_ prefix', () => {
      const id1 = generateArtifactId();
      const id2 = generateArtifactId();
      expect(id1).toMatch(/^artf_/);
      expect(id2).toMatch(/^artf_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('ArtifactEnvelopeSchema', () => {
    const validEnvelope = {
      envelope_version: ENVELOPE_VERSION,
      artifact_id: 'artf_test_0001',
      artifact_type: 'ACDS.TextAssist.Rewrite.Short',
      artifact_version: '1.0.0',
      status: 'succeeded',
      created_at: new Date().toISOString(),
      provider: 'apple-intelligence-runtime',
      provider_family: 'apple',
      output_modality: 'text',
      output_format: 'plain_text',
      input_summary: {
        source_modality: 'text',
        input_class: 'text_assist_rewrite',
        input_size: 42,
        summary: 'Test input',
      },
      payload: { primary: { text: 'rewritten text' } },
      provenance: {
        provider_route: 'apple.apple-intelligence-runtime',
        method: 'text.rewrite',
        requested_by: 'test',
        execution_started_at: new Date().toISOString(),
        execution_completed_at: new Date().toISOString(),
        normalizations: [],
      },
      policy: {
        provider_eligibility: 'allowed',
        local_only_requirement: false,
        content_policy_result: 'passed',
        consent_required: false,
        retention_policy: 'ephemeral_preview_plus_artifact_log',
        policy_trace: ['artifact class TextAssist allowed'],
      },
      limitations: {
        quality_tier: 'consumer_demo_grade',
        known_constraints: [],
      },
    };

    it('accepts a valid envelope', () => {
      const result = ArtifactEnvelopeSchema.safeParse(validEnvelope);
      expect(result.success).toBe(true);
    });

    it('rejects envelope with missing artifact_id', () => {
      const { artifact_id: _, ...invalid } = validEnvelope;
      const result = ArtifactEnvelopeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects envelope with invalid status', () => {
      const result = ArtifactEnvelopeSchema.safeParse({ ...validEnvelope, status: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('rejects envelope with invalid output_modality', () => {
      const result = ArtifactEnvelopeSchema.safeParse({ ...validEnvelope, output_modality: 'video' });
      expect(result.success).toBe(false);
    });

    it('accepts envelope with optional layers', () => {
      const withOptionals = {
        ...validEnvelope,
        quality: { score: 0.8, dimensions: { coherence: 0.9 }, evaluator: 'auto' },
        execution: { duration_ms: 150, fallback_used: false, retries: 0 },
        tags: ['test'],
      };
      const result = ArtifactEnvelopeSchema.safeParse(withOptionals);
      expect(result.success).toBe(true);
    });
  });

  describe('createBlockedEnvelope', () => {
    it('produces a valid blocked envelope', () => {
      const envelope = createBlockedEnvelope(
        'ACDS.TextAssist.Rewrite.Short',
        '1.0.0',
        'Policy blocked',
        ['test trace'],
      );
      expect(envelope.status).toBe('blocked');
      expect(envelope.provider).toBe('none');
      expect(envelope.policy.policy_trace).toContain('test trace');
      const result = ArtifactEnvelopeSchema.safeParse(envelope);
      expect(result.success).toBe(true);
    });
  });

  describe('createFailedEnvelope', () => {
    it('produces a valid failed envelope', () => {
      const envelope = createFailedEnvelope(
        'ACDS.TextModel.Classify',
        '1.0.0',
        'Provider timeout',
        'apple-intelligence-runtime',
        'apple',
      );
      expect(envelope.status).toBe('failed');
      expect(envelope.provider).toBe('apple-intelligence-runtime');
      const result = ArtifactEnvelopeSchema.safeParse(envelope);
      expect(result.success).toBe(true);
    });
  });
});
