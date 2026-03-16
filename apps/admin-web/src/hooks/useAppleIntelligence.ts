import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getBridgeHealth,
  getBridgeCapabilities,
  executeBridgePrompt,
  type ExecuteRequest,
} from '../features/apple-intelligence/appleIntelligenceApi';

const BRIDGE_HEALTH_KEY = ['apple-intelligence', 'health'] as const;
const BRIDGE_CAPABILITIES_KEY = ['apple-intelligence', 'capabilities'] as const;

export function useBridgeHealth() {
  return useQuery({
    queryKey: BRIDGE_HEALTH_KEY,
    queryFn: getBridgeHealth,
    refetchInterval: 30_000,
  });
}

export function useBridgeCapabilities() {
  return useQuery({
    queryKey: BRIDGE_CAPABILITIES_KEY,
    queryFn: getBridgeCapabilities,
  });
}

export function useExecuteBridgePrompt() {
  return useMutation({
    mutationFn: (request: ExecuteRequest) => executeBridgePrompt(request),
  });
}
