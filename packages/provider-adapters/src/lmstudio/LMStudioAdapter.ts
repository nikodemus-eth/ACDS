import type { ProviderAdapter } from '../base/ProviderAdapter.js';
import type { AdapterRequest, AdapterResponse, AdapterConnectionResult, AdapterConfig } from '../base/AdapterTypes.js';
import { AdapterError } from '../base/AdapterError.js';
import { toLMStudioRequest, fromLMStudioResponse } from './LMStudioMapper.js';
import type { LMStudioChatResponse } from './LMStudioMapper.js';

export class LMStudioAdapter implements ProviderAdapter {
  readonly vendorName = 'lmstudio';

  validateConfig(config: AdapterConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config.baseUrl) errors.push('baseUrl is required');
    try { if (config.baseUrl) new URL(config.baseUrl); } catch { errors.push('baseUrl is not a valid URL'); }
    return { valid: errors.length === 0, errors };
  }

  async testConnection(config: AdapterConfig): Promise<AdapterConnectionResult> {
    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(config.timeout ?? 15000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) return { success: false, latencyMs, message: `HTTP ${response.status}` };
      const data = await response.json() as { data?: Array<{ id: string }> };
      const models = data.data?.map((m) => m.id) ?? [];
      return { success: true, latencyMs, message: 'Connected', models };
    } catch (error) {
      return { success: false, latencyMs: Date.now() - start, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async execute(config: AdapterConfig, request: AdapterRequest): Promise<AdapterResponse> {
    const lmRequest = toLMStudioRequest(request);
    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lmRequest),
        signal: AbortSignal.timeout(config.timeout ?? 30000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) throw new AdapterError({ message: `LM Studio returned HTTP ${response.status}`, code: 'HTTP_ERROR', retryable: response.status >= 500 });
      const data = await response.json() as LMStudioChatResponse;
      return fromLMStudioResponse(data, latencyMs);
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      throw new AdapterError({
        message: isTimeout ? 'LM Studio request timed out' : 'LM Studio execution failed',
        code: isTimeout ? 'TIMEOUT' : 'EXECUTION_FAILED',
        retryable: !isTimeout && !(error instanceof TypeError),
        cause: error instanceof Error ? error : undefined,
      });
    }
  }
}
