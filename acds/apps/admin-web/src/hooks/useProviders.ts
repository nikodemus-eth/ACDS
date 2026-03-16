import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProviders,
  getProvider,
  createProvider,
  updateProvider,
  disableProvider,
  testConnection,
  type CreateProviderPayload,
  type UpdateProviderPayload,
} from '../features/providers/providersApi';

const PROVIDERS_KEY = ['providers'] as const;

export function useProviders() {
  return useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: listProviders,
  });
}

export function useProvider(id: string) {
  return useQuery({
    queryKey: [...PROVIDERS_KEY, id],
    queryFn: () => getProvider(id),
    enabled: !!id,
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProviderPayload) => createProvider(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROVIDERS_KEY });
    },
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProviderPayload }) =>
      updateProvider(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROVIDERS_KEY });
    },
  });
}

export function useDisableProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => disableProvider(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROVIDERS_KEY });
    },
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => testConnection(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: [...PROVIDERS_KEY, id] });
    },
  });
}
