import { apiClient } from '../../lib/apiClient';

// ── Response types ────────────────────────────────────────────────────────

export interface CandidateRankingEntry {
  candidateId: string;
  rank: number;
  score: number;
}

export interface RankingSnapshotView {
  familyKey: string;
  candidateRankings: CandidateRankingEntry[];
  explorationRate: number;
  capturedAt: string;
}

export interface RollbackCandidateView {
  familyKey: string;
  targetAdaptationEventId: string;
  trigger: string;
  eventCreatedAt: string;
  candidateCount: number;
}

export interface RollbackHistoryView {
  id: string;
  familyKey: string;
  targetAdaptationEventId: string;
  actor: string;
  reason: string;
  rolledBackAt: string;
}

export interface RollbackPreviewView {
  safe: boolean;
  warnings: string[];
  currentSnapshot: RankingSnapshotView;
  restoredSnapshot: RankingSnapshotView;
}

export interface RollbackExecutionResponse {
  id: string;
  familyKey: string;
  targetAdaptationEventId: string;
  actor: string;
  reason: string;
  rolledBackAt: string;
}

// ── API calls ─────────────────────────────────────────────────────────────

export function listRollbackCandidates(
  familyKey?: string,
): Promise<RollbackCandidateView[]> {
  const params: Record<string, string | undefined> = {
    familyKey,
  };
  return apiClient.get<RollbackCandidateView[]>('/adaptation/rollbacks/candidates', params);
}

export function listRollbackHistory(
  familyKey?: string,
): Promise<RollbackHistoryView[]> {
  const params: Record<string, string | undefined> = {
    familyKey,
  };
  return apiClient.get<RollbackHistoryView[]>('/adaptation/rollbacks/history', params);
}

export function previewRollback(
  familyKey: string,
  targetEventId: string,
): Promise<RollbackPreviewView> {
  return apiClient.post<RollbackPreviewView>(
    `/adaptation/rollbacks/${encodeURIComponent(familyKey)}/preview`,
    { targetEventId },
  );
}

export function executeRollback(
  familyKey: string,
  targetEventId: string,
  reason: string,
): Promise<RollbackExecutionResponse> {
  return apiClient.post<RollbackExecutionResponse>(
    `/adaptation/rollbacks/${encodeURIComponent(familyKey)}/execute`,
    { targetEventId, reason },
  );
}
