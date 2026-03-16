import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listRollbackCandidates,
  listRollbackHistory,
  previewRollback,
  executeRollback,
} from '../features/adaptation/adaptationRollbackApi';

const ROLLBACK_KEY = ['adaptation', 'rollbacks'] as const;

export function useRollbackCandidates(familyKey?: string) {
  return useQuery({
    queryKey: [...ROLLBACK_KEY, 'candidates', familyKey],
    queryFn: () => listRollbackCandidates(familyKey),
  });
}

export function useRollbackHistory(familyKey?: string) {
  return useQuery({
    queryKey: [...ROLLBACK_KEY, 'history', familyKey],
    queryFn: () => listRollbackHistory(familyKey),
  });
}

export function usePreviewRollback() {
  return useMutation({
    mutationFn: ({
      familyKey,
      targetEventId,
    }: {
      familyKey: string;
      targetEventId: string;
    }) => previewRollback(familyKey, targetEventId),
  });
}

export function useExecuteRollback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      familyKey,
      targetEventId,
      reason,
    }: {
      familyKey: string;
      targetEventId: string;
      reason: string;
    }) => executeRollback(familyKey, targetEventId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLLBACK_KEY });
    },
  });
}
