import type { ModelProfile, TacticProfile } from '@acds/core-types';
import { apiClient } from '../../lib/apiClient';

export function listModelProfiles(): Promise<ModelProfile[]> {
  return apiClient.get<ModelProfile[]>('/profiles/model');
}

export function getModelProfile(id: string): Promise<ModelProfile> {
  return apiClient.get<ModelProfile>(`/profiles/model/${id}`);
}

export function listTacticProfiles(): Promise<TacticProfile[]> {
  return apiClient.get<TacticProfile[]>('/profiles/tactic');
}

export function getTacticProfile(id: string): Promise<TacticProfile> {
  return apiClient.get<TacticProfile>(`/profiles/tactic/${id}`);
}

export interface CreateProfilePayload {
  type: 'model' | 'tactic';
  name: string;
  description: string;
  [key: string]: unknown;
}

export function createProfile(payload: CreateProfilePayload): Promise<ModelProfile | TacticProfile> {
  const { type, ...body } = payload;
  return apiClient.post<ModelProfile | TacticProfile>(`/profiles/${type}`, body);
}

export function updateProfile(
  type: 'model' | 'tactic',
  id: string,
  payload: Record<string, unknown>,
): Promise<ModelProfile | TacticProfile> {
  return apiClient.patch<ModelProfile | TacticProfile>(`/profiles/${type}/${id}`, payload);
}
