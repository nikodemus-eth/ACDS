import type { ArtifactRegistryEntry } from '../artifact-registry.js';

// ---------------------------------------------------------------------------
// Family Normalizer Interface
// ---------------------------------------------------------------------------

/**
 * Family normalizers handle input/output normalization specific to each
 * artifact family. The pipeline delegates to the appropriate normalizer
 * during intake (input) and post-processing (output) stages.
 */
export interface FamilyNormalizer {
  /** The artifact family this normalizer handles (e.g., 'TextAssist') */
  readonly family: string;

  /** Quality dimension names this family tracks */
  readonly qualityDimensions: string[];

  /**
   * Normalize raw input into the canonical form expected by the provider.
   * Should validate required fields and apply defaults.
   * Throws if input is invalid.
   */
  normalizeInput(rawInput: unknown, entry: ArtifactRegistryEntry): unknown;

  /**
   * Normalize raw provider output into canonical payload form.
   * Maps provider-specific fields to the standard primary/secondary structure.
   */
  normalizeOutput(
    rawOutput: unknown,
    entry: ArtifactRegistryEntry,
  ): { primary: unknown; secondary?: unknown };

  /**
   * Compute an input summary for the envelope.
   */
  summarizeInput(
    rawInput: unknown,
    entry: ArtifactRegistryEntry,
  ): { source_modality: string; input_class: string; input_size: number; summary: string };
}
