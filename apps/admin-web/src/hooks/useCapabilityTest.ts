import { useQuery, useMutation } from '@tanstack/react-query';
import { getCapabilities, testCapability } from '../features/providers/capabilityTestApi';

const CAPABILITIES_KEY = ['capabilities'] as const;

export function useCapabilities(providerId: string) {
  return useQuery({
    queryKey: [...CAPABILITIES_KEY, providerId],
    queryFn: () => getCapabilities(providerId),
    enabled: !!providerId,
  });
}

export function useTestCapability() {
  return useMutation({
    mutationFn: (params: {
      providerId: string;
      capabilityId: string;
      input: Record<string, unknown>;
      settings?: Record<string, unknown>;
    }) => testCapability(params.providerId, params.capabilityId, params.input, params.settings),
  });
}
