import { apiClient } from '../../lib/apiClient';

// ── Response types ────────────────────────────────────────────────────────

export interface MetricTrendView {
  label: string;
  mean: number;
  latest: number;
}

export interface FamilyPerformanceView {
  familyKey: string;
  rollingScore: number;
  trend: string;
  runCount: number;
  recentFailures: number;
  metricTrends: MetricTrendView[];
  lastUpdated: string;
}

export interface CandidateView {
  candidateId: string;
  familyKey: string;
  rollingScore: number;
  runCount: number;
  successRate: number;
  averageLatency: number;
  lastSelectedAt: string;
}

export interface AdaptationEventView {
  id: string;
  familyKey: string;
  trigger: string;
  mode: string;
  previousRankingCount: number;
  newRankingCount: number;
  evidenceSummary: string;
  createdAt: string;
}

export interface AdaptationRecommendationView {
  id: string;
  familyKey: string;
  evidence: string;
  status: string;
  createdAt: string;
}

// ── API calls ─────────────────────────────────────────────────────────────

export function listFamilyPerformance(): Promise<FamilyPerformanceView[]> {
  return apiClient.get<FamilyPerformanceView[]>('/adaptation/families');
}

export function getFamilyDetail(familyKey: string): Promise<FamilyPerformanceView> {
  return apiClient.get<FamilyPerformanceView>(`/adaptation/families/${encodeURIComponent(familyKey)}`);
}

export function getCandidateRankings(familyKey: string): Promise<CandidateView[]> {
  return apiClient.get<CandidateView[]>(
    `/adaptation/families/${encodeURIComponent(familyKey)}/candidates`,
  );
}

export function listAdaptationEvents(
  params?: Record<string, string | undefined>,
): Promise<AdaptationEventView[]> {
  return apiClient.get<AdaptationEventView[]>('/adaptation/events', params);
}

export function listRecommendations(): Promise<AdaptationRecommendationView[]> {
  return apiClient.get<AdaptationRecommendationView[]>('/adaptation/recommendations');
}
