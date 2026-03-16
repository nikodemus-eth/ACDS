import { apiClient } from '../../lib/apiClient';

// ── Response types ────────────────────────────────────────────────────────

export interface ApprovalView {
  id: string;
  familyKey: string;
  recommendationId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'superseded';
  evidence: string;
  currentRankingCount: number;
  proposedRankingCount: number;
  adaptiveMode: string;
  submittedAt: string;
  expiresAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
}

export interface ApprovalDetailView extends ApprovalView {
  previousRanking: CandidateRankingSummary[];
  proposedRanking: CandidateRankingSummary[];
}

export interface CandidateRankingSummary {
  candidateId: string;
  rank: number;
  score: number;
}

export interface ApprovalFilters {
  status?: string;
  familyKey?: string;
}

export interface ApprovalDecisionResponse {
  id: string;
  status: string;
  decidedAt: string;
  decidedBy: string;
}

// ── API calls ─────────────────────────────────────────────────────────────

export function listApprovals(filters?: ApprovalFilters): Promise<ApprovalView[]> {
  const params: Record<string, string | undefined> = {
    status: filters?.status,
    familyKey: filters?.familyKey,
  };
  return apiClient.get<ApprovalView[]>('/adaptation/approvals', params);
}

export function getApproval(id: string): Promise<ApprovalDetailView> {
  return apiClient.get<ApprovalDetailView>(`/adaptation/approvals/${encodeURIComponent(id)}`);
}

export function approveRecommendation(
  id: string,
  reason?: string,
): Promise<ApprovalDecisionResponse> {
  return apiClient.post<ApprovalDecisionResponse>(
    `/adaptation/approvals/${encodeURIComponent(id)}/approve`,
    { reason },
  );
}

export function rejectRecommendation(
  id: string,
  reason?: string,
): Promise<ApprovalDecisionResponse> {
  return apiClient.post<ApprovalDecisionResponse>(
    `/adaptation/approvals/${encodeURIComponent(id)}/reject`,
    { reason },
  );
}
