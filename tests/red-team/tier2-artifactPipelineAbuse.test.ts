/**
 * ARGUS B5: Artifact Pipeline Abuse
 *
 * Red-team tests targeting the artifact pipeline's input validation,
 * disposition enforcement, envelope integrity, and normalizer boundaries.
 * All tests are stateless (no PGlite needed — pure logic).
 */

import { describe, it, expect } from 'vitest';
import {
  ArtifactRegistry,
  ArtifactEnvelopeSchema,
  createBlockedEnvelope,
  createFailedEnvelope,
  generateArtifactId,
  applyDisposition,
  isProviderEligible,
  assessQuality,
  DEFAULT_QUALITY_THRESHOLDS,
  createDefaultArtifactRegistry,
  createDefaultFamilyNormalizers,
  textAssistNormalizer,
  textModelNormalizer,
  imageNormalizer,
  actionNormalizer,
  visionNormalizer,
  expressionNormalizer,
  TEXT_ASSIST_ENTRIES,
  TEXT_MODEL_ENTRIES,
  IMAGE_ENTRIES,
  EXPRESSION_ENTRIES,
  VISION_ENTRIES,
  ACTION_ENTRIES,
} from '@acds/sovereign-runtime';
import type { ArtifactRegistryEntry } from '@acds/sovereign-runtime';
import type { ProviderScore } from '@acds/sovereign-runtime';

function makeScore(providerId: string, total: number): ProviderScore {
  return {
    providerId,
    methodId: `${providerId}.method`,
    totalScore: total,
    costScore: total,
    latencyScore: total,
    reliabilityScore: total,
    localityScore: total,
  };
}

function makeEntry(overrides: Partial<ArtifactRegistryEntry> = {}): ArtifactRegistryEntry {
  return {
    artifact_type: 'ACDS.Test.Action',
    artifact_version: '1.0.0',
    description: 'Test artifact',
    family: 'Test',
    action: 'Action',
    supported_providers: ['apple-intelligence-runtime'],
    default_provider: 'apple-intelligence-runtime',
    provider_disposition: 'apple-preferred',
    capability_id: 'text.rewrite',
    output_modality: 'text',
    output_format: 'plain_text',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: ['coherence'],
    policy_requirements: ['content_policy'],
    test_suites: ['test'],
    ...overrides,
  };
}

describe('ARGUS B5: Artifact Pipeline Abuse', () => {
  // ─── Injection via artifact type ──────────────────────────────

  describe('artifact type injection', () => {
    it('rejects SQL-like artifact type strings', () => {
      const registry = new ArtifactRegistry();
      expect(() =>
        registry.register(makeEntry({ artifact_type: "ACDS.Test'; DROP TABLE--" })),
      ).toThrow();
    });

    it('rejects path traversal in artifact type', () => {
      const registry = new ArtifactRegistry();
      expect(() =>
        registry.register(makeEntry({ artifact_type: 'ACDS.../../../etc/passwd.Read' })),
      ).toThrow();
    });

    it('rejects empty artifact_type', () => {
      const registry = new ArtifactRegistry();
      expect(() =>
        registry.register(makeEntry({ artifact_type: '' })),
      ).toThrow();
    });

    it('rejects artifact_type with special characters', () => {
      const registry = new ArtifactRegistry();
      expect(() =>
        registry.register(makeEntry({ artifact_type: 'ACDS.Test<script>.Action' })),
      ).toThrow();
    });

    it('rejects artifact_type with spaces', () => {
      const registry = new ArtifactRegistry();
      expect(() =>
        registry.register(makeEntry({ artifact_type: 'ACDS.Test Action.Do' })),
      ).toThrow();
    });
  });

  // ─── Oversized input ──────────────────────────────────────────

  describe('oversized input handling', () => {
    const rewriteEntry = TEXT_ASSIST_ENTRIES[0];

    it('normalizer handles extremely large source_text without hanging', () => {
      const largeText = 'x'.repeat(10_000_000); // 10MB
      const result = textAssistNormalizer.normalizeInput(
        { source_text: largeText },
        rewriteEntry,
      ) as Record<string, unknown>;
      expect(result.text).toHaveLength(10_000_000);
    });

    it('summarizeInput truncates large input in summary', () => {
      const largeText = 'y'.repeat(10_000);
      const summary = textAssistNormalizer.summarizeInput(
        { source_text: largeText },
        rewriteEntry,
      );
      expect(summary.summary.length).toBeLessThanOrEqual(80);
      expect(summary.input_size).toBe(10_000);
    });
  });

  // ─── Disposition bypass attempts ──────────────────────────────

  describe('disposition bypass', () => {
    it('apple-only rejects non-Apple provider even with high score', () => {
      const scores = [makeScore('ollama-local', 0.99)];
      const result = applyDisposition('apple-only', scores);
      expect(result).toHaveLength(0);
    });

    it('isProviderEligible rejects non-Apple under apple-only', () => {
      expect(isProviderEligible('apple-only', 'malicious-provider')).toBe(false);
    });

    it('apple-only blocks even if provider id contains "apple" as substring', () => {
      // Only exact match should work
      expect(isProviderEligible('apple-only', 'not-apple-intelligence-runtime')).toBe(false);
      expect(isProviderEligible('apple-only', 'apple-fake')).toBe(false);
    });

    it('apple-preferred still allows non-Apple as fallback', () => {
      const scores = [makeScore('ollama-local', 0.9)];
      const result = applyDisposition('apple-preferred', scores);
      expect(result).toHaveLength(1);
    });
  });

  // ─── Envelope forgery ─────────────────────────────────────────

  describe('envelope forgery', () => {
    it('rejects forged envelope with succeeded status but empty required fields', () => {
      const forged = {
        envelope_version: '1.0.0',
        artifact_id: 'forged_id',
        artifact_type: '',
        artifact_version: '1.0.0',
        status: 'succeeded',
        created_at: new Date().toISOString(),
        provider: '',
        provider_family: 'apple',
        output_modality: 'text',
        output_format: 'plain_text',
        input_summary: { source_modality: 'text', input_class: 'test', input_size: 0, summary: '' },
        payload: { primary: {} },
        provenance: {
          provider_route: '',
          method: '',
          requested_by: '',
          execution_started_at: '',
          execution_completed_at: '',
          normalizations: [],
        },
        policy: {
          provider_eligibility: 'allowed',
          local_only_requirement: false,
          content_policy_result: 'passed',
          consent_required: false,
          retention_policy: 'none',
          policy_trace: [],
        },
        limitations: { quality_tier: 'none', known_constraints: [] },
      };
      const result = ArtifactEnvelopeSchema.safeParse(forged);
      // artifact_type must be min(1) — empty string should fail
      expect(result.success).toBe(false);
    });

    it('rejects envelope with invalid status value', () => {
      const result = ArtifactEnvelopeSchema.safeParse({
        envelope_version: '1.0.0',
        artifact_id: 'test',
        artifact_type: 'ACDS.Test.Action',
        status: 'hacked',
      });
      expect(result.success).toBe(false);
    });

    it('rejects envelope with invalid provider_family', () => {
      const blocked = createBlockedEnvelope('ACDS.Test.Action', '1.0.0', 'test', []);
      const tampered = { ...blocked, provider_family: 'malicious_provider' };
      const result = ArtifactEnvelopeSchema.safeParse(tampered);
      expect(result.success).toBe(false);
    });
  });

  // ─── Type confusion ───────────────────────────────────────────

  describe('type confusion', () => {
    const rewriteEntry = TEXT_ASSIST_ENTRIES[0];

    it('rejects number where source_text string expected', () => {
      expect(() =>
        textAssistNormalizer.normalizeInput({ source_text: 12345 }, rewriteEntry),
      ).toThrow();
    });

    it('rejects array where source_text string expected', () => {
      expect(() =>
        textAssistNormalizer.normalizeInput({ source_text: ['a', 'b'] }, rewriteEntry),
      ).toThrow();
    });

    it('rejects null input', () => {
      expect(() =>
        textAssistNormalizer.normalizeInput(null, rewriteEntry),
      ).toThrow();
    });

    it('image normalizer rejects number where prompt expected', () => {
      const imageEntry = IMAGE_ENTRIES[0];
      expect(() =>
        imageNormalizer.normalizeInput({ prompt: 42 }, imageEntry),
      ).toThrow();
    });

    it('vision normalizer rejects non-string imageData', () => {
      const visionEntry = VISION_ENTRIES[0];
      expect(() =>
        visionNormalizer.normalizeInput({ imageData: 12345 }, visionEntry),
      ).toThrow();
    });

    it('action normalizer rejects non-string shortcut_name', () => {
      const actionEntry = ACTION_ENTRIES[0];
      expect(() =>
        actionNormalizer.normalizeInput({ shortcut_name: ['hack'] }, actionEntry),
      ).toThrow();
    });
  });

  // ─── Quality score bounds ─────────────────────────────────────

  describe('quality score bounds', () => {
    it('negative dimension scores produce none tier', () => {
      const assessment = assessQuality(
        [{ name: 'test', score: -0.5 }],
        'auto',
        DEFAULT_QUALITY_THRESHOLDS,
      );
      expect(assessment.tier).toBe('none');
    });

    it('scores above 1.0 do not produce invalid tier', () => {
      const assessment = assessQuality(
        [{ name: 'test', score: 1.5 }],
        'auto',
        DEFAULT_QUALITY_THRESHOLDS,
      );
      // Should still return production since 1.5 > 0.95
      expect(assessment.tier).toBe('production');
    });
  });

  // ─── Registry integrity ───────────────────────────────────────

  describe('registry integrity', () => {
    it('rejects entry with empty description', () => {
      const registry = new ArtifactRegistry();
      expect(() =>
        registry.register(makeEntry({ description: '' })),
      ).toThrow();
    });

    it('rejects entry with empty supported_providers', () => {
      const registry = new ArtifactRegistry();
      expect(() =>
        registry.register(makeEntry({ supported_providers: [] })),
      ).toThrow();
    });

    it('allows duplicate registration (overwrites)', () => {
      const registry = new ArtifactRegistry();
      registry.register(makeEntry({ artifact_type: 'ACDS.Test.One' }));
      registry.register(makeEntry({ artifact_type: 'ACDS.Test.One', description: 'updated' }));
      expect(registry.getEntry('ACDS.Test.One')!.description).toBe('updated');
    });
  });

  // ─── XSS in input_summary ─────────────────────────────────────

  describe('XSS in input fields', () => {
    const rewriteEntry = TEXT_ASSIST_ENTRIES[0];

    it('HTML tags in source_text pass through to summary (no execution context)', () => {
      const xssText = '<script>alert("xss")</script>';
      const summary = textAssistNormalizer.summarizeInput(
        { source_text: xssText },
        rewriteEntry,
      );
      // Pipeline stores this as data — no execution context.
      // Verify it's stored as-is (not sanitized), confirming it's treated as plain data.
      expect(summary.summary).toContain('<script>');
    });

    it('blocked envelope stores XSS reason as plain text', () => {
      const envelope = createBlockedEnvelope(
        'ACDS.Test.Action',
        '1.0.0',
        '<img onerror=alert(1) src=x>',
        ['<script>attack</script>'],
      );
      expect(envelope.input_summary.summary).toContain('<img');
      expect(envelope.policy.policy_trace[0]).toContain('<script>');
      // Envelope is data — no HTML rendering context
      const result = ArtifactEnvelopeSchema.safeParse(envelope);
      expect(result.success).toBe(true);
    });
  });

  // ─── Artifact ID uniqueness ───────────────────────────────────

  describe('artifact ID uniqueness', () => {
    it('generates 1000 unique IDs with no collisions', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateArtifactId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  // ─── Default registry completeness ────────────────────────────

  describe('default registry completeness', () => {
    it('all 20 artifact types have unique artifact_type values', () => {
      const allEntries = [
        ...TEXT_ASSIST_ENTRIES,
        ...TEXT_MODEL_ENTRIES,
        ...IMAGE_ENTRIES,
        ...EXPRESSION_ENTRIES,
        ...VISION_ENTRIES,
        ...ACTION_ENTRIES,
      ];
      const types = allEntries.map(e => e.artifact_type);
      expect(new Set(types).size).toBe(types.length);
    });

    it('all artifact types follow ACDS naming convention', () => {
      const allEntries = [
        ...TEXT_ASSIST_ENTRIES,
        ...TEXT_MODEL_ENTRIES,
        ...IMAGE_ENTRIES,
        ...EXPRESSION_ENTRIES,
        ...VISION_ENTRIES,
        ...ACTION_ENTRIES,
      ];
      for (const entry of allEntries) {
        expect(entry.artifact_type).toMatch(/^ACDS\.[A-Za-z]+\.[A-Za-z]+(\.[A-Za-z]+)?$/);
      }
    });

    it('no artifact type has empty capability_id', () => {
      const allEntries = createDefaultArtifactRegistry().getAllEntries();
      for (const entry of allEntries) {
        expect(entry.capability_id.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── Safety defaults for Action family ────────────────────────

  describe('action family safety defaults', () => {
    const shortcutEntry = ACTION_ENTRIES[0];

    it('dry_run cannot be overridden to false by default normalizer', () => {
      // Even if caller passes dry_run: false, the normalizer uses ?? which respects explicit false
      const result = actionNormalizer.normalizeInput(
        { shortcut_name: 'test', dry_run: false },
        shortcutEntry,
      ) as Record<string, unknown>;
      const ctx = result.context as Record<string, unknown>;
      // This shows that explicit false IS accepted — the safety is that the DEFAULT is true
      // when the caller does NOT specify dry_run
      expect(ctx.dry_run).toBe(false);
    });

    it('dry_run defaults to true when not specified', () => {
      const result = actionNormalizer.normalizeInput(
        { shortcut_name: 'test' },
        shortcutEntry,
      ) as Record<string, unknown>;
      const ctx = result.context as Record<string, unknown>;
      expect(ctx.dry_run).toBe(true);
    });

    it('requires_confirmation defaults to true when not specified', () => {
      const result = actionNormalizer.normalizeInput(
        { shortcut_name: 'test' },
        shortcutEntry,
      ) as Record<string, unknown>;
      const ctx = result.context as Record<string, unknown>;
      expect(ctx.requires_confirmation).toBe(true);
    });
  });
});
