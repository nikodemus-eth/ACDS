const BRIDGE_URL = 'http://localhost:11435';

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

async function bridgeGet<T>(path: string): Promise<T> {
  const response = await fetch(`${BRIDGE_URL}${path}`);
  if (!response.ok) throw new Error(`Bridge request failed: ${response.status}`);
  return response.json();
}

export function getBridgeHealth(): Promise<BridgeHealth> {
  return bridgeGet<BridgeHealth>('/health');
}

export function getBridgeCapabilities(): Promise<BridgeCapabilities> {
  return bridgeGet<BridgeCapabilities>('/capabilities');
}

export async function executeBridgePrompt(request: ExecuteRequest): Promise<ExecuteResponse> {
  const response = await fetch(`${BRIDGE_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Bridge execution failed: ${response.status}`);
  return response.json();
}
