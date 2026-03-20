import type { FamilyNormalizer } from '../pipeline/family-normalizer.js';
import type { ArtifactRegistryEntry } from '../artifact-registry.js';
import { CAPABILITY_IDS } from '../../domain/capability-taxonomy.js';

// ---------------------------------------------------------------------------
// TextAssist Family — writing tools (rewrite, summarize, proofread, tone)
// ---------------------------------------------------------------------------

const FAMILY = 'TextAssist';
const APPLE_PROVIDER = 'apple-intelligence-runtime';

export const TEXT_ASSIST_QUALITY_DIMENSIONS = [
  'instruction_adherence',
  'meaning_preservation',
  'coherence',
] as const;

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

interface TextAssistInput {
  source_text: string;
  operation?: string;
  tone?: string;
  style?: string;
  max_length?: number;
}

export const textAssistNormalizer: FamilyNormalizer = {
  family: FAMILY,
  qualityDimensions: [...TEXT_ASSIST_QUALITY_DIMENSIONS],

  normalizeInput(rawInput: unknown, entry: ArtifactRegistryEntry): unknown {
    const input = rawInput as Record<string, unknown>;
    if (!input || typeof input.source_text !== 'string' || input.source_text.length === 0) {
      throw new Error('TextAssist input requires a non-empty source_text field');
    }

    const normalized: Record<string, unknown> = {
      text: input.source_text,
    };

    // Map operation-specific fields to capability input schemas
    if (entry.action === 'Rewrite' || entry.action === 'ToneShift') {
      normalized.style = (input as TextAssistInput).tone
        ?? (input as TextAssistInput).style
        ?? 'default';
    }

    return normalized;
  },

  normalizeOutput(
    rawOutput: unknown,
    _entry: ArtifactRegistryEntry,
  ): { primary: unknown; secondary?: unknown } {
    const output = rawOutput as Record<string, unknown>;

    return {
      primary: {
        text: output.rewrittenText ?? output.summary ?? output.correctedText ?? output.text ?? '',
      },
      secondary: {
        edit_summary: output.corrections
          ? `${(output.corrections as unknown[]).length} corrections applied`
          : undefined,
        original_length: typeof output.originalLength === 'number' ? output.originalLength : undefined,
      },
    };
  },

  summarizeInput(
    rawInput: unknown,
    entry: ArtifactRegistryEntry,
  ): { source_modality: string; input_class: string; input_size: number; summary: string } {
    const input = rawInput as TextAssistInput;
    const text = input?.source_text ?? '';
    return {
      source_modality: 'text',
      input_class: `text_assist_${entry.action.toLowerCase()}`,
      input_size: text.length,
      summary: text.length > 80 ? `${text.slice(0, 77)}...` : text,
    };
  },
};

// ---------------------------------------------------------------------------
// Registry Entries
// ---------------------------------------------------------------------------

export const TEXT_ASSIST_ENTRIES: ArtifactRegistryEntry[] = [
  {
    artifact_type: 'ACDS.TextAssist.Rewrite.Short',
    artifact_version: '1.0.0',
    description: 'Rewrite short text passages with optional style guidance',
    family: FAMILY,
    action: 'Rewrite',
    variant: 'Short',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.TEXT_REWRITE,
    output_modality: 'text',
    output_format: 'plain_text',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...TEXT_ASSIST_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['text-assist-rewrite'],
  },
  {
    artifact_type: 'ACDS.TextAssist.Summarize.Short',
    artifact_version: '1.0.0',
    description: 'Summarize short text passages into concise summaries',
    family: FAMILY,
    action: 'Summarize',
    variant: 'Short',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.TEXT_SUMMARIZE,
    output_modality: 'text',
    output_format: 'plain_text',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...TEXT_ASSIST_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['text-assist-summarize'],
  },
  {
    artifact_type: 'ACDS.TextAssist.Proofread',
    artifact_version: '1.0.0',
    description: 'Proofread text and suggest corrections',
    family: FAMILY,
    action: 'Proofread',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.TEXT_PROOFREAD,
    output_modality: 'text',
    output_format: 'plain_text',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...TEXT_ASSIST_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['text-assist-proofread'],
  },
  {
    artifact_type: 'ACDS.TextAssist.ToneShift',
    artifact_version: '1.0.0',
    description: 'Rewrite text to match a specified tone (formal, casual, friendly, etc.)',
    family: FAMILY,
    action: 'ToneShift',
    supported_providers: [APPLE_PROVIDER, 'ollama-local'],
    default_provider: APPLE_PROVIDER,
    provider_disposition: 'apple-preferred',
    capability_id: CAPABILITY_IDS.TEXT_REWRITE,
    output_modality: 'text',
    output_format: 'plain_text',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: [...TEXT_ASSIST_QUALITY_DIMENSIONS],
    policy_requirements: ['content_policy'],
    test_suites: ['text-assist-toneshift'],
  },
];
