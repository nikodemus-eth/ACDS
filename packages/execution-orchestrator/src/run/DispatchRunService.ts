import type { DispatchRunRequest, DispatchRunResponse, RoutingRequest } from '@acds/core-types';
import type { DispatchResult } from '@acds/routing-engine';
import type { AdapterRequest, AdapterResponse } from '@acds/provider-adapters';
import type { ExecutionStatusTracker } from './ExecutionStatusTracker.js';

export interface DispatchRunDeps {
  resolveRoute(request: RoutingRequest): DispatchResult;
  executeProvider(providerId: string, request: AdapterRequest, apiKey?: string): Promise<AdapterResponse>;
  resolveApiKey(providerId: string): Promise<string | undefined>;
}

export class DispatchRunService {
  constructor(
    private readonly statusTracker: ExecutionStatusTracker,
    private readonly deps: DispatchRunDeps
  ) {}

  async run(request: DispatchRunRequest): Promise<DispatchRunResponse> {
    const { decision, rationale } = this.deps.resolveRoute(request.routingRequest);

    const executionId = await this.statusTracker.create(decision, request.routingRequest);
    await this.statusTracker.markRunning(executionId);

    try {
      const apiKey = await this.deps.resolveApiKey(decision.selectedProviderId);
      const adapterRequest: AdapterRequest = {
        prompt: request.inputPayload,
        model: decision.selectedModelProfileId,
        responseFormat: request.inputFormat === 'json' ? 'json' : 'text',
      };

      const response = await this.deps.executeProvider(decision.selectedProviderId, adapterRequest, apiKey);
      await this.statusTracker.markSucceeded(executionId, response);

      return {
        executionId,
        status: 'succeeded',
        normalizedOutput: response.content,
        outputFormat: request.inputFormat,
        selectedModelProfileId: decision.selectedModelProfileId,
        selectedTacticProfileId: decision.selectedTacticProfileId,
        selectedProviderId: decision.selectedProviderId,
        latencyMs: response.latencyMs,
        fallbackUsed: false,
        fallbackAttempts: 0,
        rationaleId: rationale.id,
        rationaleSummary: decision.rationaleSummary,
      };
    } catch (error) {
      await this.statusTracker.markFailed(executionId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
}
