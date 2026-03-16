import { useQuery } from '@tanstack/react-query';
import {
  listFamilyPerformance,
  getFamilyDetail,
  getCandidateRankings,
  listAdaptationEvents,
  listRecommendations,
} from '../features/adaptation/adaptationApi';

const ADAPTATION_KEY = ['adaptation'] as const;

export function useFamilyPerformanceList() {
  return useQuery({
    queryKey: [...ADAPTATION_KEY, 'families'],
    queryFn: () => listFamilyPerformance(),
  });
}

export function useFamilyDetail(familyKey: string) {
  return useQuery({
    queryKey: [...ADAPTATION_KEY, 'families', familyKey],
    queryFn: () => getFamilyDetail(familyKey),
    enabled: !!familyKey,
  });
}

export function useCandidateRankings(familyKey: string) {
  return useQuery({
    queryKey: [...ADAPTATION_KEY, 'candidates', familyKey],
    queryFn: () => getCandidateRankings(familyKey),
    enabled: !!familyKey,
  });
}

export function useAdaptationEvents(params?: Record<string, string | undefined>) {
  return useQuery({
    queryKey: [...ADAPTATION_KEY, 'events', params],
    queryFn: () => listAdaptationEvents(params),
  });
}

export function useAdaptationRecommendations() {
  return useQuery({
    queryKey: [...ADAPTATION_KEY, 'recommendations'],
    queryFn: () => listRecommendations(),
  });
}
