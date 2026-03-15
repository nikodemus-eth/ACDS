import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  type PolicyPayload,
} from '../features/policies/policiesApi';

const POLICIES_KEY = ['policies'] as const;

export function usePolicies(level?: string) {
  return useQuery({
    queryKey: [...POLICIES_KEY, level ?? 'all'],
    queryFn: () => listPolicies(level),
  });
}

export function usePolicy(id: string) {
  return useQuery({
    queryKey: [...POLICIES_KEY, id],
    queryFn: () => getPolicy(id),
    enabled: !!id,
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PolicyPayload) => createPolicy(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: POLICIES_KEY });
    },
  });
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<PolicyPayload> }) =>
      updatePolicy(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: POLICIES_KEY });
    },
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePolicy(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: POLICIES_KEY });
    },
  });
}
