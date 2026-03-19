import type { ProviderAdapter } from '../base/ProviderAdapter.js';
import type { AdapterRequest, AdapterResponse, AdapterConnectionResult, AdapterConfig } from '../base/AdapterTypes.js';
import { AdapterError } from '../base/AdapterError.js';
import { toGeminiRequest, fromGeminiResponse } from './GeminiMapper.js';
import type { GeminiGenerateResponse } from './GeminiMapper.js';

export class GeminiAdapter implements ProviderAdapter {
  readonly vendorName = 'gemini';

  validateConfig(config: AdapterConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config.baseUrl) errors.push('baseUrl is required');
    if (!config.apiKey) errors.push('apiKey is required for Gemini');
    return { valid: errors.length === 0, errors };
  }

  async testConnection(config: AdapterConfig): Promise<AdapterConnectionResult> {
    const start = Date.now();
    const baseUrl = `${config.baseUrl}/v1beta/models`;
    try {
      const response = await fetch(`${baseUrl}?key=${config.apiKey}`, {
        signal: AbortSignal.timeout(config.timeout ?? 15000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) return { success: false, latencyMs, message: `HTTP ${response.status}` };
      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) ?? [];
      return { success: true, latencyMs, message: 'Connected', models };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, latencyMs: Date.now() - start, message: msg.replace(/key=[^&\s]+/gi, 'key=[REDACTED]') };
    }
  }

  async execute(config: AdapterConfig, request: AdapterRequest): Promise<AdapterResponse> {
    const geminiRequest = toGeminiRequest(request);
    const start = Date.now();
    const baseEndpoint = `${config.baseUrl}/v1beta/models/${request.model}:generateContent`;
    try {
      const response = await fetch(`${baseEndpoint}?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiRequest),
        signal: AbortSignal.timeout(config.timeout ?? 30000),
      });
      const latencyMs = Date.now() - start;
      if (!response.ok) throw new AdapterError({ message: `Gemini returned HTTP ${response.status}`, code: 'HTTP_ERROR', retryable: response.status >= 500 });
      const data = await response.json() as GeminiGenerateResponse;
      return fromGeminiResponse(data, latencyMs, request.model);
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      const redact = (s: string) => s.replace(/key=[^&\s]+/gi, 'key=[REDACTED]');
      const causeError = error instanceof Error ? error : undefined;
      // Sanitize the cause error message to prevent API key leakage
      const sanitizedCause = causeError
        ? Object.assign(new Error(redact(causeError.message)), { stack: causeError.stack ? redact(causeError.stack) : undefined })
        : undefined;
      throw new AdapterError({
        message: redact(isTimeout ? `Gemini request timed out for ${baseEndpoint}` : `Gemini execution failed for ${baseEndpoint}`),
        code: isTimeout ? 'TIMEOUT' : 'EXECUTION_FAILED',
        retryable: !isTimeout && !(error instanceof TypeError),
        cause: sanitizedCause,
      });
    }
  }
}
