// ---------------------------------------------------------------------------
// ArtifactPresenter – transforms ArtifactRegistryEntry to API views
// ---------------------------------------------------------------------------

import type { ArtifactRegistryEntry } from '@acds/sovereign-runtime';

export interface ArtifactEntryView {
  artifact_type: string;
  artifact_version: string;
  description: string;
  family: string;
  action: string;
  variant?: string;
  supported_providers: string[];
  default_provider: string;
  provider_disposition: string;
  capability_id: string;
  output_modality: string;
  output_format: string;
  quality_tier: string;
  quality_metrics: string[];
  policy_requirements: string[];
  test_suites: string[];
}

export interface ArtifactFamilySummaryView {
  family: string;
  count: number;
  artifact_types: string[];
  dispositions: string[];
  output_modalities: string[];
}

export class ArtifactPresenter {
  static toView(entry: ArtifactRegistryEntry): ArtifactEntryView {
    return {
      artifact_type: entry.artifact_type,
      artifact_version: entry.artifact_version,
      description: entry.description,
      family: entry.family,
      action: entry.action,
      variant: entry.variant,
      supported_providers: entry.supported_providers,
      default_provider: entry.default_provider,
      provider_disposition: entry.provider_disposition,
      capability_id: entry.capability_id,
      output_modality: entry.output_modality,
      output_format: entry.output_format,
      quality_tier: entry.quality_tier,
      quality_metrics: entry.quality_metrics,
      policy_requirements: entry.policy_requirements,
      test_suites: entry.test_suites,
    };
  }

  static toViewList(entries: ArtifactRegistryEntry[]): ArtifactEntryView[] {
    return entries.map(ArtifactPresenter.toView);
  }

  static toFamilySummary(family: string, entries: ArtifactRegistryEntry[]): ArtifactFamilySummaryView {
    return {
      family,
      count: entries.length,
      artifact_types: entries.map(e => e.artifact_type),
      dispositions: [...new Set(entries.map(e => e.provider_disposition))],
      output_modalities: [...new Set(entries.map(e => e.output_modality))],
    };
  }

  static toFamilySummaryList(
    familyMap: Map<string, ArtifactRegistryEntry[]>,
  ): ArtifactFamilySummaryView[] {
    const summaries: ArtifactFamilySummaryView[] = [];
    for (const [family, entries] of familyMap) {
      summaries.push(ArtifactPresenter.toFamilySummary(family, entries));
    }
    return summaries;
  }
}
