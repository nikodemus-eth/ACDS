import type { FamilyNormalizer } from '../pipeline/family-normalizer.js';
import type { ArtifactRegistryEntry } from '../artifact-registry.js';
import { CAPABILITY_IDS } from '../../domain/capability-taxonomy.js';

// ---------------------------------------------------------------------------
// TextModel Family — structured NLP tasks (classify, extract, rank, answer)
// ---------------------------------------------------------------------------

const FAMILY = 'TextModel';
const APPLE_PROVIDER = 'apple-intelligence-runtime';

export const TEXT_MODEL_QUALITY_DIMENSIONS = [
  'instruction_adherence',
  'grounding_faithfulness',
  'schema_conformance',
] as const;

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

export const textModelNormalizer: FamilyNormalizer = {
  family: FAMILY,
  qualityDimensions: [...TEXT_MODEL_QUALITY_DIMENSIONS],

  normalizeInput(rawInput: unknown, entry: ArtifactRegistryEntry): unknown {
    const input = rawInput as Record<string, unknown>;

    if (entry.action === 'Classify') {
      if (typeof input?.text !== 'string' || input.text.length === 0) {
        throw new Error('TextModel.Classify requires a non-empty text field');
      }
      return {
        text: input.text,
        labels: Array.isArray(input.labels) ? input.labels : undefined,
      };
    }

    if (entry.action === 'Extract') {
      if (typeof input?.text !== 'string' || input.text.length === 0) {
        throw new Error('TextModel.Extract requires a non-empty text field');
      }
      return { text: input.text };
    }

    if (entry.action === 'Rank') {
      if (typeof input?.text !== 'string') {
        throw new Error('TextModel.Rank requires a text field');
      }
      if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
        throw new Error('TextModel.Rank requires a non-empty candidates array');
      }
      return {
        text: input.text,
        labels: input.candidates,
      };
    }

    if (entry.action === 'Answer') {
      if (typeof input?.prompt !== 'string' || input.prompt.length === 0) {
        throw new Error('TextModel.Answer requires a non-empty prompt field');
      }
      return {
        prompt: input.prompt,
        maxTokens: typeof input.maxTokens === 'number' ? input.maxTokens : 512,
      };
    }

    // Fallback: pass through
    return input;
  },

  normalizeOutput(
    rawOutput: unknown,
    entry: ArtifactRegistryEntry,
  ): { primary: unknown; secondary?: unknown } {
    const output = rawOutput as Record<string, unknown>;

    if (entry.action === 'Classify') {
      return {
        primary: {
          label: output.label ?? 'unknown',
          confidence: output.confidence ?? 0,
        },
      };
    }

    if (entry.action === 'Extract') {
      return {
        primary: {
          entities: output.entities ?? [],
        },
      };
    }

    if (entry.action === 'Rank') {
      return {
        primary: {
          ranked_items: output.label
            ? [{ label: output.label, confidence: output.confidence ?? 0 }]
            : [],
        },
      };
    }

    if (entry.action === 'Answer') {
      return {
        primary: {
          text: output.text ?? '',
          token_count: output.tokenCount ?? 0,
        },
      };
    }

    return { primary: output };
  },

  summarizeInput(
    rawInput: unknown,
    entry: ArtifactRegistryEntry,
  ): { source_modality: string; input_class: string; input_size: number; summary: string } {
    const input = rawInput as Record<string, unknown>;
    const text = (typeof input?.text === 'string' ? input.text : input?.prompt as string) ?? '';
    return {
      source_modality: 'text',
      input_class: `text_model_${entry.action.toLowerCase()}`,
      input_size: text.length,
      summary: text.length > 80 ? `${text.slice(0, 77)}...` : text,
    };
  },
};

// ---------------------------------------------------------------------------
// Registry Entries
// ---------------------------------------------------------------------------

export const TEXT_MODEL_ENTRIES: ArtifactRegistryEntry[] = [
  {
    artifact_type: 'ACDS.TextModel.Classify',
    artifact_version: '1.0.0',
    description: 'Classify text into predefined or dynamic categories',
    family: FAMILY,
    action: 'Classify',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-optional',
    capability_id: CAPABILITY_IDS.TEXT_CLASSIFY,
    output_modality: 'text',
    output_format: 'json',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...TEXT_MODEL_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['text-model-classify'],
  },
  {
    artifact_type: 'ACDS.TextModel.Extract',
    artifact_version: '1.0.0',
    description: 'Extract structured entities from unstructured text',
    family: FAMILY,
    action: 'Extract',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-optional',
    capability_id: CAPABILITY_IDS.TEXT_EXTRACT,
    output_modality: 'text',
    output_format: 'json',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...TEXT_MODEL_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['text-model-extract'],
  },
  {
    artifact_type: 'ACDS.TextModel.Rank',
    artifact_version: '1.0.0',
    description: 'Rank candidate items by relevance to a query or context',
    family: FAMILY,
    action: 'Rank',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-optional',
    capability_id: CAPABILITY_IDS.TEXT_CLASSIFY,
    output_modality: 'text',
    output_format: 'json',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...TEXT_MODEL_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['text-model-rank'],
  },
  {
    artifact_type: 'ACDS.TextModel.Answer.Bounded',
    artifact_version: '1.0.0',
    description: 'Generate bounded text answers from a prompt with token limits',
    family: FAMILY,
    action: 'Answer',
    variant: 'Bounded',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-optional',
    capability_id: CAPABILITY_IDS.TEXT_GENERATE,
    output_modality: 'text',
    output_format: 'plain_text',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...TEXT_MODEL_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['text-model-answer'],
  },
];
