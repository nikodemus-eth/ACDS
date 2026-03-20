import { z } from 'zod';
import type { ProviderDisposition, QualityTier, OutputModality, OutputFormat } from './artifact-envelope.js';
import { PROVIDER_DISPOSITIONS, QUALITY_TIERS, OUTPUT_MODALITIES, OUTPUT_FORMATS } from './artifact-envelope.js';

// ---------------------------------------------------------------------------
// Artifact Registry Entry
// ---------------------------------------------------------------------------

export interface ArtifactRegistryEntry {
  artifact_type: string;
  artifact_version: string;
  description: string;
  family: string;
  action: string;
  variant?: string;
  supported_providers: string[];
  default_provider: string;
  provider_disposition: ProviderDisposition;
  capability_id: string;
  output_modality: OutputModality;
  output_format: OutputFormat;
  quality_tier: QualityTier;
  quality_metrics: string[];
  policy_requirements: string[];
  test_suites: string[];
  input_schema?: z.ZodType;
  output_schema?: z.ZodType;
}

export const ArtifactRegistryEntrySchema = z.object({
  artifact_type: z.string().regex(/^ACDS\.[A-Za-z]+\.[A-Za-z]+(\.[A-Za-z]+)?$/),
  artifact_version: z.string(),
  description: z.string().min(1),
  family: z.string().min(1),
  action: z.string().min(1),
  variant: z.string().optional(),
  supported_providers: z.array(z.string()).min(1),
  default_provider: z.string().min(1),
  provider_disposition: z.enum(PROVIDER_DISPOSITIONS),
  capability_id: z.string().min(1),
  output_modality: z.enum(OUTPUT_MODALITIES),
  output_format: z.enum(OUTPUT_FORMATS),
  quality_tier: z.enum(QUALITY_TIERS),
  quality_metrics: z.array(z.string()),
  policy_requirements: z.array(z.string()),
  test_suites: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Artifact Registry
// ---------------------------------------------------------------------------

export class ArtifactRegistry {
  private readonly entries = new Map<string, ArtifactRegistryEntry>();
  private readonly familyIndex = new Map<string, Set<string>>();

  loadFromEntries(entries: ArtifactRegistryEntry[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  register(entry: ArtifactRegistryEntry): void {
    const validation = ArtifactRegistryEntrySchema.safeParse(entry);
    if (!validation.success) {
      throw new Error(
        `Invalid artifact registry entry for ${entry.artifact_type}: ${validation.error.message}`,
      );
    }
    this.entries.set(entry.artifact_type, entry);

    let familySet = this.familyIndex.get(entry.family);
    if (!familySet) {
      familySet = new Set();
      this.familyIndex.set(entry.family, familySet);
    }
    familySet.add(entry.artifact_type);
  }

  getEntry(artifactType: string): ArtifactRegistryEntry | undefined {
    return this.entries.get(artifactType);
  }

  getEntriesByFamily(family: string): ArtifactRegistryEntry[] {
    const typeSet = this.familyIndex.get(family);
    if (!typeSet) return [];
    return [...typeSet].map(t => this.entries.get(t)!);
  }

  getAllEntries(): ArtifactRegistryEntry[] {
    return [...this.entries.values()];
  }

  has(artifactType: string): boolean {
    return this.entries.has(artifactType);
  }

  get size(): number {
    return this.entries.size;
  }

  get families(): string[] {
    return [...this.familyIndex.keys()];
  }
}
