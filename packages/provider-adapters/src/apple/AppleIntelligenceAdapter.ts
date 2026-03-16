import type { ProviderAdapter } from '../base/ProviderAdapter.js';
import type { AdapterRequest, AdapterResponse, AdapterConnectionResult, AdapterConfig } from '../base/AdapterTypes.js';
import { AdapterError } from '../base/AdapterError.js';
import { toAppleBridgeRequest, fromAppleBridgeResponse } from './AppleIntelligenceMapper.js';
import type { AppleBridgeResponse } from './AppleIntelligenceMapper.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export class AppleIntelligenceAdapter implements ProviderAdapter {
  readonly vendorName = 'apple';

  validateConfig(config: AdapterConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config.baseUrl) {
      errors.push('baseUrl is required');
      return { valid: false, errors };
    }
    try {
      const url = new URL(config.baseUrl);
      if (!LOOPBACK_HOSTS.has(url.hostname)) {
        errors.push('baseUrl must target a loopback address (localhost/127.0.0.1/[::1]) — Apple Intelligence runs on-device only');
      }
    } catch {
      errors.push('baseUrl is not a valid URL');
    }
    return { valid: errors.length === 0, errors };
  }

  async testConnection(config: AdapterConfig): Promise<AdapterConnectionResult> {
    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}/health`, {
        signal: AbortSignal.timeout(config.timeout ?? 15000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        return { success: false, latencyMs, message: `HTTP ${response.status}` };
      }
      const data = await response.json() as { status: string; models?: string[] };
      return { success: true, latencyMs, message: 'Connected', models: data.models };
    } catch (error) {
      return { success: false, latencyMs: Date.now() - start, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async execute(config: AdapterConfig, request: AdapterRequest): Promise<AdapterResponse> {
    const bridgeRequest = toAppleBridgeRequest(request);
    const start = Date.now();
    try {
      const response = await fetch(`${config.baseUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bridgeRequest),
        signal: AbortSignal.timeout(config.timeout ?? 30000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) {
        throw new AdapterError({ message: `Apple Intelligence bridge returned HTTP ${response.status}`, code: 'HTTP_ERROR', retryable: response.status >= 500 });
      }
      const data = await response.json() as AppleBridgeResponse;
      return fromAppleBridgeResponse(data, latencyMs);
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      throw new AdapterError({
        message: isTimeout ? 'Apple Intelligence request timed out' : 'Apple Intelligence execution failed',
        code: isTimeout ? 'TIMEOUT' : 'EXECUTION_FAILED',
        retryable: !isTimeout && !(error instanceof TypeError),
        cause: error instanceof Error ? error : undefined,
      });
    }
  }
}
