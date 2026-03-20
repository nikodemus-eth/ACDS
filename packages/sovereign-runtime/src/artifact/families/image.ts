import type { FamilyNormalizer } from '../pipeline/family-normalizer.js';
import type { ArtifactRegistryEntry } from '../artifact-registry.js';
import { CAPABILITY_IDS } from '../../domain/capability-taxonomy.js';

// ---------------------------------------------------------------------------
// Image Family — image generation (stylized, preview, concept)
// ---------------------------------------------------------------------------

const FAMILY = 'Image';
const APPLE_PROVIDER = 'apple-intelligence-runtime';

const VALID_STYLES = ['illustration', 'animation', 'sketch', 'photorealistic', 'concept'] as const;
type ImageStyle = (typeof VALID_STYLES)[number];

export const IMAGE_QUALITY_DIMENSIONS = [
  'prompt_alignment',
  'style_consistency',
  'subject_clarity',
] as const;

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

export const imageNormalizer: FamilyNormalizer = {
  family: FAMILY,
  qualityDimensions: [...IMAGE_QUALITY_DIMENSIONS],

  normalizeInput(rawInput: unknown, entry: ArtifactRegistryEntry): unknown {
    const input = rawInput as Record<string, unknown>;
    if (!input || typeof input.prompt !== 'string' || input.prompt.length === 0) {
      throw new Error('Image input requires a non-empty prompt field');
    }

    const requestedStyle = typeof input.style === 'string' ? input.style : undefined;
    const style = VALID_STYLES.includes(requestedStyle as ImageStyle)
      ? requestedStyle
      : entry.variant === 'Concept'
        ? 'concept'
        : 'illustration';

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
        style_applied: output.style ?? 'unknown',
        dimensions: {
          width: output.width ?? 0,
          height: output.height ?? 0,
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
      input_class: `image_${entry.action.toLowerCase()}_${(entry.variant ?? 'default').toLowerCase()}`,
      input_size: prompt.length,
      summary: prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt,
    };
  },
};

// ---------------------------------------------------------------------------
// Registry Entries
// ---------------------------------------------------------------------------

export const IMAGE_ENTRIES: ArtifactRegistryEntry[] = [
  {
    artifact_type: 'ACDS.Image.Generate.Stylized',
    artifact_version: '1.0.0',
    description: 'Generate stylized images (illustration, animation, sketch) from text prompts',
    family: FAMILY,
    action: 'Generate',
    variant: 'Stylized',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.IMAGE_GENERATE,
    output_modality: 'image',
    output_format: 'png',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...IMAGE_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy', 'image_safety'],
    test_suites: ['image-generate-stylized'],
  },
  {
    artifact_type: 'ACDS.Image.Generate.Preview',
    artifact_version: '1.0.0',
    description: 'Generate lower-quality preview images for rapid iteration',
    family: FAMILY,
    action: 'Generate',
    variant: 'Preview',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.IMAGE_GENERATE,
    output_modality: 'image',
    output_format: 'jpeg',
    quality_tier: 'experimental',
    quality_metrics: [...IMAGE_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy', 'image_safety'],
    test_suites: ['image-generate-preview'],
  },
  {
    artifact_type: 'ACDS.Image.Generate.Concept',
    artifact_version: '1.0.0',
    description: 'Generate concept art style images for ideation and prototyping',
    family: FAMILY,
    action: 'Generate',
    variant: 'Concept',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.IMAGE_GENERATE,
    output_modality: 'image',
    output_format: 'png',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...IMAGE_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy', 'image_safety'],
    test_suites: ['image-generate-concept'],
  },
];
