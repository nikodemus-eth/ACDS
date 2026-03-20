import { apiClient } from '../../lib/apiClient';

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

export interface ArtifactFamilySummary {
  family: string;
  count: number;
  artifact_types: string[];
  dispositions: string[];
  output_modalities: string[];
}

export interface ArtifactFamilyDetail {
  family: string;
  entries: ArtifactEntryView[];
}

export interface ArtifactStats {
  total_artifacts: number;
  total_families: number;
  families: string[];
  by_disposition: Record<string, number>;
  by_modality: Record<string, number>;
  by_quality_tier: Record<string, number>;
}

export function listArtifacts(): Promise<ArtifactEntryView[]> {
  return apiClient.get<ArtifactEntryView[]>('/artifacts');
}

export function getArtifactByType(artifactType: string): Promise<ArtifactEntryView> {
  return apiClient.get<ArtifactEntryView>(`/artifacts/type/${artifactType}`);
}

export function listArtifactFamilies(): Promise<ArtifactFamilySummary[]> {
  return apiClient.get<ArtifactFamilySummary[]>('/artifacts/families');
}

export function getArtifactFamily(family: string): Promise<ArtifactFamilyDetail> {
  return apiClient.get<ArtifactFamilyDetail>(`/artifacts/families/${family}`);
}

export function getArtifactStats(): Promise<ArtifactStats> {
  return apiClient.get<ArtifactStats>('/artifacts/stats');
}
