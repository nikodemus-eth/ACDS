import type { FamilyNormalizer } from '../pipeline/family-normalizer.js';
import type { ArtifactRegistryEntry } from '../artifact-registry.js';
import { CAPABILITY_IDS } from '../../domain/capability-taxonomy.js';

// ---------------------------------------------------------------------------
// Vision Family — image understanding (describe, OCR, classify, contextualize)
// ---------------------------------------------------------------------------

const FAMILY = 'Vision';
const APPLE_PROVIDER = 'apple-intelligence-runtime';

export const VISION_QUALITY_DIMENSIONS = [
  'accuracy',
  'completeness',
  'grounding_faithfulness',
] as const;

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

export const visionNormalizer: FamilyNormalizer = {
  family: FAMILY,
  qualityDimensions: [...VISION_QUALITY_DIMENSIONS],

  normalizeInput(rawInput: unknown, entry: ArtifactRegistryEntry): unknown {
    const input = rawInput as Record<string, unknown>;

    if (entry.action === 'Classify') {
      // Vision.Classify uses text.classify with image context
      if (typeof input?.text !== 'string') {
        throw new Error('Vision.Classify requires a text field with image description');
      }
      return {
        text: input.text,
        labels: Array.isArray(input.labels) ? input.labels : undefined,
      };
    }

    // Describe, Extract.Text, Contextualize all need imageData
    if (typeof input?.imageData !== 'string' || input.imageData.length === 0) {
      throw new Error(`Vision.${entry.action} requires a non-empty imageData field`);
    }

    if (entry.action === 'Contextualize') {
      return {
        imageData: input.imageData,
        context: typeof input.context === 'string' ? input.context : undefined,
      };
    }

    return { imageData: input.imageData };
  },

  normalizeOutput(
    rawOutput: unknown,
    entry: ArtifactRegistryEntry,
  ): { primary: unknown; secondary?: unknown } {
    const output = rawOutput as Record<string, unknown>;

    if (entry.action === 'Describe' || entry.action === 'Contextualize') {
      return {
        primary: {
          description: output.description ?? '',
          tags: output.tags ?? [],
        },
        secondary: {
          confidence: output.confidence ?? 0,
        },
      };
    }

    if (entry.action === 'Extract') {
      return {
        primary: {
          extracted_text: output.extractedText ?? '',
        },
        secondary: {
          confidence: output.confidence ?? 0,
        },
      };
    }

    if (entry.action === 'Classify') {
      return {
        primary: {
          label: output.label ?? 'unknown',
          confidence: output.confidence ?? 0,
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
    const imageSize = typeof input?.imageData === 'string' ? input.imageData.length : 0;
    return {
      source_modality: 'image',
      input_class: `vision_${entry.action.toLowerCase()}`,
      input_size: imageSize,
      summary: `Image input for ${entry.artifact_type} (${imageSize} bytes)`,
    };
  },
};

// ---------------------------------------------------------------------------
// Registry Entries
// ---------------------------------------------------------------------------

export const VISION_ENTRIES: ArtifactRegistryEntry[] = [
  {
    artifact_type: 'ACDS.Vision.Describe',
    artifact_version: '1.0.0',
    description: 'Describe the contents of an image in natural language',
    family: FAMILY,
    action: 'Describe',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.IMAGE_DESCRIBE,
    output_modality: 'vision_result',
    output_format: 'json',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...VISION_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['vision-describe'],
  },
  {
    artifact_type: 'ACDS.Vision.Extract.Text',
    artifact_version: '1.0.0',
    description: 'Extract text from an image via optical character recognition',
    family: FAMILY,
    action: 'Extract',
    variant: 'Text',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.IMAGE_OCR,
    output_modality: 'vision_result',
    output_format: 'json',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...VISION_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['vision-extract-text'],
  },
  {
    artifact_type: 'ACDS.Vision.Classify',
    artifact_version: '1.0.0',
    description: 'Classify image content into categories using text-based classification',
    family: FAMILY,
    action: 'Classify',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-optional',
    capability_id: CAPABILITY_IDS.TEXT_CLASSIFY,
    output_modality: 'vision_result',
    output_format: 'json',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...VISION_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['vision-classify'],
  },
  {
    artifact_type: 'ACDS.Vision.Contextualize',
    artifact_version: '1.0.0',
    description: 'Describe an image with additional user-provided context',
    family: FAMILY,
    action: 'Contextualize',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.IMAGE_DESCRIBE,
    output_modality: 'vision_result',
    output_format: 'json',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...VISION_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['vision-contextualize'],
  },
];
