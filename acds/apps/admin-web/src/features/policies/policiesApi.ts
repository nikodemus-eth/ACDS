import { apiClient } from '../../lib/apiClient';

export interface PolicyRecord {
  id: string;
  level: 'global' | 'application' | 'process';
  application?: string;
  process?: string;
  allowedVendors: string[];
  blockedVendors: string[];
  defaults: Record<string, unknown>;
  constraints: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyPayload {
  level: 'global' | 'application' | 'process';
  application?: string;
  process?: string;
  allowedVendors?: string[];
  blockedVendors?: string[];
  defaults?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  enabled?: boolean;
}

export function listPolicies(level?: string): Promise<PolicyRecord[]> {
  return apiClient.get<PolicyRecord[]>('/policies', { level });
}

export function getPolicy(id: string): Promise<PolicyRecord> {
  return apiClient.get<PolicyRecord>(`/policies/${id}`);
}

export function createPolicy(payload: PolicyPayload): Promise<PolicyRecord> {
  return apiClient.post<PolicyRecord>('/policies', payload);
}

export function updatePolicy(id: string, payload: Partial<PolicyPayload>): Promise<PolicyRecord> {
  return apiClient.patch<PolicyRecord>(`/policies/${id}`, payload);
}

export function deletePolicy(id: string): Promise<void> {
  return apiClient.delete<void>(`/policies/${id}`);
}
