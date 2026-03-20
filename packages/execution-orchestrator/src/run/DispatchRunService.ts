import type { DispatchRunRequest, DispatchRunResponse, RoutingRequest } from '@acds/core-types';
import type { DispatchResult } from '@acds/routing-engine';
import type { AdapterRequest, AdapterResponse } from '@acds/provider-adapters';
import type { ExecutionStatusTracker } from './ExecutionStatusTracker.js';
import { FallbackDecisionTracker } from '../fallback/FallbackDecisionTracker.js';
import { FallbackExecutionService } from '../fallback/FallbackExecutionService.js';

export interface DispatchRunDeps {
  resolveRoute(request: RoutingRequest): Promise<DispatchResult>;
  executeProvider(providerId: string, request: AdapterRequest, apiKey?: string): Promise<AdapterResponse>;
  resolveApiKey(providerId: string): Promise<string | undefined>;
  resolveModelId(modelProfileId: string): Promise<string>;
}

export class DispatchRunService {
  private readonly fallbackTracker: FallbackDecisionTracker;
  private readonly fallbackService: FallbackExecutionService;

  constructor(
    private readonly statusTracker: ExecutionStatusTracker,
    private readonly deps: DispatchRunDeps,
    fallbackTracker?: FallbackDecisionTracker,
  ) {
    this.fallbackTracker = fallbackTracker ?? new FallbackDecisionTracker();
    this.fallbackService = new FallbackExecutionService(
      this.statusTracker,
      this.fallbackTracker,
      {
        executeProvider: deps.executeProvider,
        resolveApiKey: deps.resolveApiKey,
        resolveModelId: deps.resolveModelId,
      },
    );
  }

  async resolveRoute(request: RoutingRequest): Promise<DispatchResult> {
    return this.deps.resolveRoute(request);
  }

  async run(request: DispatchRunRequest): Promise<DispatchRunResponse> {
    const { decision, rationale } = await this.deps.resolveRoute(request.routingRequest);

    const executionId = await this.statusTracker.create(decision, request.routingRequest);
    await this.statusTracker.markRunning(executionId);

    const primaryModelId = await this.deps.resolveModelId(decision.selectedModelProfileId);
    const adapterRequest: AdapterRequest = {
      prompt: request.inputPayload,
      model: primaryModelId,
      responseFormat: request.inputFormat === 'json' ? 'json' : 'text',
    };

    try {
      const apiKey = await this.deps.resolveApiKey(decision.selectedProviderId);
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const fallbackResponse = await this.fallbackService.executeFallbacks(
        executionId,
        decision,
        adapterRequest,
        errorMessage,
      );

      if (!fallbackResponse) {
        await this.statusTracker.markFailed(executionId, errorMessage);
        throw error;
      }

      const attempts = this.fallbackTracker
        .getAttempts(executionId)
        .filter((attempt) => attempt.status === 'failed' || attempt.status === 'succeeded');
      const successfulAttempt = attempts.find((attempt) => attempt.status === 'succeeded');

      return {
        executionId,
        status: 'fallback_succeeded',
        normalizedOutput: fallbackResponse.content,
        outputFormat: request.inputFormat,
        selectedModelProfileId: successfulAttempt?.entry.modelProfileId ?? decision.selectedModelProfileId,
        selectedTacticProfileId: successfulAttempt?.entry.tacticProfileId ?? decision.selectedTacticProfileId,
        selectedProviderId: successfulAttempt?.entry.providerId ?? decision.selectedProviderId,
        latencyMs: fallbackResponse.latencyMs,
        fallbackUsed: true,
        fallbackAttempts: attempts.length,
        rationaleId: rationale.id,
        rationaleSummary: decision.rationaleSummary,
      };
    }
  }
}
