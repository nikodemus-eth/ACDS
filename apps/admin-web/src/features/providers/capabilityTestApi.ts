import type { CapabilityManifestEntry, CapabilityTestResponse } from '@acds/core-types';
import { apiClient } from '../../lib/apiClient';

export function getCapabilities(providerId: string): Promise<CapabilityManifestEntry[]> {
  return apiClient.get<CapabilityManifestEntry[]>(`/providers/${providerId}/capabilities`);
}

export function testCapability(
  providerId: string,
  capabilityId: string,
  input: Record<string, unknown>,
  settings?: Record<string, unknown>,
): Promise<CapabilityTestResponse> {
  return apiClient.post<CapabilityTestResponse>(
    `/providers/${providerId}/capabilities/${encodeURIComponent(capabilityId)}/test`,
    { input, settings },
  );
}
