import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listModelProfiles,
  getModelProfile,
  listTacticProfiles,
  getTacticProfile,
  createProfile,
  updateProfile,
  type CreateProfilePayload,
} from '../features/profiles/profilesApi';

const MODEL_PROFILES_KEY = ['profiles', 'model'] as const;
const TACTIC_PROFILES_KEY = ['profiles', 'tactic'] as const;

export function useModelProfiles() {
  return useQuery({
    queryKey: MODEL_PROFILES_KEY,
    queryFn: listModelProfiles,
  });
}

export function useModelProfile(id: string) {
  return useQuery({
    queryKey: [...MODEL_PROFILES_KEY, id],
    queryFn: () => getModelProfile(id),
    enabled: !!id,
  });
}

export function useTacticProfiles() {
  return useQuery({
    queryKey: TACTIC_PROFILES_KEY,
    queryFn: listTacticProfiles,
  });
}

export function useTacticProfile(id: string) {
  return useQuery({
    queryKey: [...TACTIC_PROFILES_KEY, id],
    queryFn: () => getTacticProfile(id),
    enabled: !!id,
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProfilePayload) => createProfile(payload),
    onSuccess: (_data, variables) => {
      const key = variables.type === 'model' ? MODEL_PROFILES_KEY : TACTIC_PROFILES_KEY;
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      type,
      id,
      payload,
    }: {
      type: 'model' | 'tactic';
      id: string;
      payload: Record<string, unknown>;
    }) => updateProfile(type, id, payload),
    onSuccess: (_data, variables) => {
      const key = variables.type === 'model' ? MODEL_PROFILES_KEY : TACTIC_PROFILES_KEY;
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}
