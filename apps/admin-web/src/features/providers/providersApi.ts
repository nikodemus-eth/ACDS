import type { Provider, ProviderHealth } from '@acds/core-types';
import { apiClient } from '../../lib/apiClient';

export interface CreateProviderPayload {
  name: string;
  vendor: string;
  authType: string;
  baseUrl: string;
  environment: string;
  secret?: string;
}

export interface UpdateProviderPayload {
  name?: string;
  baseUrl?: string;
  environment?: string;
}

export function listProviders(): Promise<Provider[]> {
  return apiClient.get<Provider[]>('/providers');
}

export function getProvider(id: string): Promise<Provider & { health: ProviderHealth }> {
  return apiClient.get<Provider & { health: ProviderHealth }>(`/providers/${id}`);
}

export function createProvider(payload: CreateProviderPayload): Promise<Provider> {
  return apiClient.post<Provider>('/providers', payload);
}

export function updateProvider(id: string, payload: UpdateProviderPayload): Promise<Provider> {
  return apiClient.patch<Provider>(`/providers/${id}`, payload);
}

export function disableProvider(id: string): Promise<Provider> {
  return apiClient.patch<Provider>(`/providers/${id}`, { enabled: false });
}

export function testConnection(id: string): Promise<ProviderHealth> {
  return apiClient.post<ProviderHealth>(`/providers/${id}/test`);
}
