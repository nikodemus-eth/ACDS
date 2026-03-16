import { apiClient } from '../../lib/apiClient';

export interface BridgeHealth {
  status: string;
  platform: string;
  version: string;
}

export interface BridgeCapabilities {
  models: string[];
  supportedTaskTypes: string[];
  maxTokens: number;
  platform: string;
}

export interface ExecuteRequest {
  model: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ExecuteResponse {
  model: string;
  content: string;
  done: boolean;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  capabilities: string[];
}

export function getBridgeHealth(): Promise<BridgeHealth> {
  return apiClient.get<BridgeHealth>('/apple-intelligence/health');
}

export function getBridgeCapabilities(): Promise<BridgeCapabilities> {
  return apiClient.get<BridgeCapabilities>('/apple-intelligence/capabilities');
}

export function executeBridgePrompt(request: ExecuteRequest): Promise<ExecuteResponse> {
  return apiClient.post<ExecuteResponse>('/apple-intelligence/execute', request);
}
