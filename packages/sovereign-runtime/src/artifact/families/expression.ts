import type { FamilyNormalizer } from '../pipeline/family-normalizer.js';
import type { ArtifactRegistryEntry } from '../artifact-registry.js';
import { CAPABILITY_IDS } from '../../domain/capability-taxonomy.js';

// ---------------------------------------------------------------------------
// Expression Family — emoji/genmoji/sticker generation
// ---------------------------------------------------------------------------

const FAMILY = 'Expression';
const APPLE_PROVIDER = 'apple-intelligence-runtime';

export const EXPRESSION_QUALITY_DIMENSIONS = [
  'prompt_alignment',
  'style_consistency',
  'emotional_clarity',
] as const;

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

export const expressionNormalizer: FamilyNormalizer = {
  family: FAMILY,
  qualityDimensions: [...EXPRESSION_QUALITY_DIMENSIONS],

  normalizeInput(rawInput: unknown, entry: ArtifactRegistryEntry): unknown {
    const input = rawInput as Record<string, unknown>;
    if (!input || typeof input.prompt !== 'string' || input.prompt.length === 0) {
      throw new Error('Expression input requires a non-empty prompt field');
    }

    const style = entry.variant === 'Reaction' ? 'reaction' : 'inline';

    return {
      prompt: input.prompt,
      style,
    };
  },

  normalizeOutput(
    rawOutput: unknown,
    _entry: ArtifactRegistryEntry,
  ): { primary: unknown; secondary?: unknown } {
    const output = rawOutput as Record<string, unknown>;
    return {
      primary: {
        image_uri: output.artifactRef ?? output.image_uri ?? '',
        format: output.format ?? 'png',
      },
      secondary: {
        expression_type: output.style ?? 'inline',
        dimensions: {
          width: output.width ?? 64,
          height: output.height ?? 64,
        },
      },
    };
  },

  summarizeInput(
    rawInput: unknown,
    entry: ArtifactRegistryEntry,
  ): { source_modality: string; input_class: string; input_size: number; summary: string } {
    const input = rawInput as Record<string, unknown>;
    const prompt = typeof input?.prompt === 'string' ? input.prompt : '';
    return {
      source_modality: 'text',
      input_class: `expression_${(entry.variant ?? 'inline').toLowerCase()}`,
      input_size: prompt.length,
      summary: prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt,
    };
  },
};

// ---------------------------------------------------------------------------
// Registry Entries
// ---------------------------------------------------------------------------

export const EXPRESSION_ENTRIES: ArtifactRegistryEntry[] = [
  {
    artifact_type: 'ACDS.Expression.Generate.Inline',
    artifact_version: '1.0.0',
    description: 'Generate inline emoji/genmoji expressions — Apple-only, no fallback',
    family: FAMILY,
    action: 'Generate',
    variant: 'Inline',
    supported_providers: [APPLE_PROVIDER],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-only',
    capability_id: CAPABILITY_IDS.IMAGE_GENERATE,
    output_modality: 'expression',
    output_format: 'png',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...EXPRESSION_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['expression-generate-inline'],
  },
  {
    artifact_type: 'ACDS.Expression.Generate.Reaction',
    artifact_version: '1.0.0',
    description: 'Generate reaction expressions for messaging contexts',
    family: FAMILY,
    action: 'Generate',
    variant: 'Reaction',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.IMAGE_GENERATE,
    output_modality: 'expression',
    output_format: 'png',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...EXPRESSION_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['expression-generate-reaction'],
  },
];
