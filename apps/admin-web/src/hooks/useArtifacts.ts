import { useQuery } from '@tanstack/react-query';
import {
  listArtifacts,
  getArtifactByType,
  listArtifactFamilies,
  getArtifactFamily,
  getArtifactStats,
} from '../features/artifacts/artifactsApi';

const ARTIFACTS_KEY = ['artifacts'] as const;

export function useArtifacts() {
  return useQuery({
    queryKey: ARTIFACTS_KEY,
    queryFn: listArtifacts,
  });
}

export function useArtifact(artifactType: string) {
  return useQuery({
    queryKey: [...ARTIFACTS_KEY, artifactType],
    queryFn: () => getArtifactByType(artifactType),
    enabled: !!artifactType,
  });
}

export function useArtifactFamilies() {
  return useQuery({
    queryKey: [...ARTIFACTS_KEY, 'families'],
    queryFn: listArtifactFamilies,
  });
}

export function useArtifactFamily(family: string) {
  return useQuery({
    queryKey: [...ARTIFACTS_KEY, 'families', family],
    queryFn: () => getArtifactFamily(family),
    enabled: !!family,
  });
}

export function useArtifactStats() {
  return useQuery({
    queryKey: [...ARTIFACTS_KEY, 'stats'],
    queryFn: getArtifactStats,
  });
}
