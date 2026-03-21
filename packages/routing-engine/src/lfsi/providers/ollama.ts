// LFSI MVP — Ollama Inference Provider
// Uses the real OllamaAdapter from @acds/provider-adapters
// Calls the real Ollama HTTP API at localhost:11434

import { OllamaAdapter } from '@acds/provider-adapters';
import type { AdapterConfig, AdapterRequest } from '@acds/provider-adapters';
import type { InferenceProvider, InferenceRequest, InferenceResult } from '../types.js';
import { getCapability, getCapabilitiesForTier } from '../capabilities.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT = 300_000;
const DEFAULT_MODEL = 'llama3.3:latest';

export class OllamaInferenceProvider implements InferenceProvider {
  readonly id = 'ollama.default';
  readonly tier = 'tier1' as const;
  readonly local = true;
  readonly capabilities: readonly string[];

  private readonly adapter: OllamaAdapter;
  private readonly config: AdapterConfig;

  constructor(baseUrl?: string, timeout?: number) {
    this.adapter = new OllamaAdapter();
    this.config = {
      baseUrl: baseUrl ?? DEFAULT_BASE_URL,
      timeout: timeout ?? DEFAULT_TIMEOUT,
    };
    this.capabilities = getCapabilitiesForTier('tier1').map(c => c.id);
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
    if (!capability?.ollamaModel) {
      throw new Error(`Ollama provider does not support capability: ${request.capability}`);
    }

    const prompt = typeof request.input.text === 'string'
      ? request.input.text
      : typeof request.input.prompt === 'string'
        ? request.input.prompt
        : JSON.stringify(request.input);

    const adapterRequest: AdapterRequest = {
      prompt,
      model: capability.ollamaModel ?? DEFAULT_MODEL,
      systemPrompt: capability.systemPrompt,
      responseFormat: capability.responseFormat,
      temperature: request.hints?.temperature as number | undefined,
      maxTokens: request.hints?.maxTokens as number | undefined,
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
    };
  }
}
