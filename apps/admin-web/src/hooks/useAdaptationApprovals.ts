import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listApprovals,
  getApproval,
  approveRecommendation,
  rejectRecommendation,
  type ApprovalFilters,
} from '../features/adaptation/adaptationApprovalApi';

const APPROVALS_KEY = ['adaptation', 'approvals'] as const;

export function useApprovalList(filters?: ApprovalFilters) {
  return useQuery({
    queryKey: [...APPROVALS_KEY, 'list', filters],
    queryFn: () => listApprovals(filters),
  });
}

export function useApprovalDetail(id: string) {
  return useQuery({
    queryKey: [...APPROVALS_KEY, 'detail', id],
    queryFn: () => getApproval(id),
    enabled: !!id,
  });
}

export function useApproveRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      approveRecommendation(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPROVALS_KEY });
    },
  });
}

export function useRejectRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      rejectRecommendation(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPROVALS_KEY });
    },
  });
}
