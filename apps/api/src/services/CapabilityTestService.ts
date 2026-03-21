// ---------------------------------------------------------------------------
// CapabilityTestService – orchestrates capability testing for providers
// ---------------------------------------------------------------------------

import type { Provider, CapabilityTestResponse } from '@acds/core-types';
import type { ProviderRegistryService, ProviderExecutionProxy } from '@acds/provider-broker';
import type { AdapterRequest } from '@acds/provider-adapters';
import { ProviderCapabilityManifestBuilder } from './ProviderCapabilityManifestBuilder.js';
import type { CapabilityManifestEntry } from '@acds/core-types';

export interface CapabilityTestDeps {
  registryService: ProviderRegistryService;
  executionProxy: ProviderExecutionProxy;
  resolveApiKey: (providerId: string) => Promise<string | undefined>;
}

export class CapabilityTestService {
  private readonly manifestBuilder = new ProviderCapabilityManifestBuilder();

  constructor(private readonly deps: CapabilityTestDeps) {}

  async getManifest(providerId: string): Promise<CapabilityManifestEntry[]> {
    const provider = await this.resolveProvider(providerId);
    return this.manifestBuilder.buildManifest(provider);
  }

  async testCapability(
    providerId: string,
    capabilityId: string,
    input: Record<string, unknown>,
  ): Promise<CapabilityTestResponse> {
    const provider = await this.resolveProvider(providerId);
    const manifest = this.manifestBuilder.buildManifest(provider);
    const capability = manifest.find((c) => c.capabilityId === capabilityId);

    if (!capability) {
      return this.errorResponse(providerId, capabilityId, 0, {
        code: 'CAPABILITY_NOT_FOUND',
        message: `Capability '${capabilityId}' not found for provider '${provider.name}'`,
      });
    }

    if (!capability.available) {
      return this.errorResponse(providerId, capabilityId, 0, {
        code: 'CAPABILITY_UNAVAILABLE',
        message: `Capability '${capabilityId}' is not available (provider disabled)`,
      });
    }

    const startMs = Date.now();
    try {
      const apiKey = await this.deps.resolveApiKey(providerId);
      const adapterRequest = this.buildAdapterRequest(input, capabilityId);
      const response = await this.deps.executionProxy.execute(provider, adapterRequest, apiKey);

      return {
        success: true,
        providerId,
        capabilityId,
        durationMs: Date.now() - startMs,
        output: { type: capability.outputMode, value: response.content },
        rawResponse: {
          content: response.content,
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          finishReason: response.finishReason,
          latencyMs: response.latencyMs,
          ...(response.rawMetadata ?? {}),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.errorResponse(providerId, capabilityId, Date.now() - startMs, {
        code: 'EXECUTION_FAILED',
        message,
        detail: err instanceof Error ? err.stack : undefined,
      });
    }
  }

  private buildAdapterRequest(input: Record<string, unknown>, capabilityId: string): AdapterRequest {
    const prompt = typeof input.text === 'string'
      ? input.text
      : typeof input.prompt === 'string'
        ? input.prompt
        : JSON.stringify(input);

    // Extract subsystem method for Apple Intelligence capabilities.
    // e.g. 'apple.image_creator.generate' → 'image_creator.generate'
    // Non-Apple capabilities (e.g. 'text.generate') have no method.
    const method = capabilityId.startsWith('apple.')
      ? capabilityId.slice('apple.'.length)
      : undefined;

    return {
      prompt,
      systemPrompt: typeof input.systemPrompt === 'string' ? input.systemPrompt : undefined,
      model: typeof input.model === 'string' ? input.model : 'default',
      temperature: typeof input.temperature === 'number' ? input.temperature : undefined,
      maxTokens: typeof input.maxTokens === 'number' ? input.maxTokens : undefined,
      responseFormat: capabilityId.includes('extract') || capabilityId.includes('classify')
        ? 'json'
        : 'text',
      method,
    };
  }

  private errorResponse(
    providerId: string,
    capabilityId: string,
    durationMs: number,
    error: { code: string; message: string; detail?: string },
  ): CapabilityTestResponse {
    return {
      success: false,
      providerId,
      capabilityId,
      durationMs,
      output: { type: 'error', value: error.message },
      rawResponse: {},
      error,
      timestamp: new Date().toISOString(),
    };
  }

  private async resolveProvider(providerId: string): Promise<Provider> {
    const provider = await this.deps.registryService.getById(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    return provider;
  }
}
