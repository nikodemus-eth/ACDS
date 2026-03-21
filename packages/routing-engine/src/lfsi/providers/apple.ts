// LFSI MVP — Apple Inference Provider
// Uses the real AppleIntelligenceAdapter from @acds/provider-adapters
// Calls the real Apple Intelligence bridge at localhost:11435

import { AppleIntelligenceAdapter } from '@acds/provider-adapters';
import type { AdapterConfig, AdapterRequest } from '@acds/provider-adapters';
import type { InferenceProvider, InferenceRequest, InferenceResult } from '../types.js';
import { getCapability, getCapabilitiesForTier } from '../capabilities.js';

const DEFAULT_BASE_URL = 'http://localhost:11435';
const DEFAULT_TIMEOUT = 120_000;

export class AppleInferenceProvider implements InferenceProvider {
  readonly id = 'apple.foundation';
  readonly tier = 'tier0' as const;
  readonly local = true;
  readonly capabilities: readonly string[];

  private readonly adapter: AppleIntelligenceAdapter;
  private readonly config: AdapterConfig;

  constructor(baseUrl?: string, timeout?: number) {
    this.adapter = new AppleIntelligenceAdapter();
    this.config = {
      baseUrl: baseUrl ?? DEFAULT_BASE_URL,
      timeout: timeout ?? DEFAULT_TIMEOUT,
    };
    this.capabilities = getCapabilitiesForTier('tier0').map(c => c.id);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.adapter.testConnection(this.config);
      return result.success;
    } catch {
      return false;
    }
  }

  async invoke(request: InferenceRequest): Promise<InferenceResult> {
    const capability = getCapability(request.capability);
    if (!capability?.appleMethod) {
      throw new Error(`Apple provider does not support capability: ${request.capability}`);
    }

    const adapterRequest: AdapterRequest = {
      prompt: typeof request.input.text === 'string'
        ? request.input.text
        : typeof request.input.prompt === 'string'
          ? request.input.prompt
          : JSON.stringify(request.input),
      model: 'apple-fm-on-device',
      method: capability.appleMethod,
      systemPrompt: capability.systemPrompt,
      responseFormat: capability.responseFormat,
      temperature: request.hints?.temperature as number | undefined,
      maxTokens: request.hints?.maxTokens as number | undefined,
      voice: request.input.voice as string | undefined,
      rate: request.input.rate as number | undefined,
      targetLanguage: request.input.targetLanguage as string | undefined,
      sourceLanguage: request.input.sourceLanguage as string | undefined,
    };

    const start = Date.now();
    const response = await this.adapter.execute(this.config, adapterRequest);
    const latencyMs = Date.now() - start;

    return {
      providerId: this.id,
      tier: this.tier,
      output: { text: response.content },
      rawText: response.content,
      latencyMs,
      usage: {
        inputTokens: response.inputTokens ?? undefined,
        outputTokens: response.outputTokens ?? undefined,
      },
      metadata: response.rawMetadata,
    };
  }
}
