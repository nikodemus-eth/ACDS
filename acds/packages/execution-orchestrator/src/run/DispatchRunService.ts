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
  writeRouteResolved?(routingDecisionId: string, application: string, details: Record<string, unknown>): Promise<void>;
  writeRouteFallback?(routingDecisionId: string, application: string, details: Record<string, unknown>): Promise<void>;
  writeExecutionStarted?(executionId: string, application: string, details: Record<string, unknown>): Promise<void>;
  writeExecutionCompleted?(executionId: string, application: string, details: Record<string, unknown>): Promise<void>;
  writeExecutionFailed?(executionId: string, application: string, details: Record<string, unknown>): Promise<void>;
}

export class DispatchRunService {
  private readonly fallbackTracker = new FallbackDecisionTracker();
  private readonly fallbackService: FallbackExecutionService;

  constructor(
    private readonly statusTracker: ExecutionStatusTracker,
    private readonly deps: DispatchRunDeps
  ) {
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
    const result = await this.deps.resolveRoute(request);
    await this.deps.writeRouteResolved?.(result.decision.id, request.application, {
      process: request.process,
      step: request.step,
      selectedProviderId: result.decision.selectedProviderId,
      selectedModelProfileId: result.decision.selectedModelProfileId,
      selectedTacticProfileId: result.decision.selectedTacticProfileId,
      fallbackChainLength: result.decision.fallbackChain.length,
    });
    return result;
  }

  async run(request: DispatchRunRequest): Promise<DispatchRunResponse> {
    const { decision, rationale } = await this.resolveRoute(request.routingRequest);

    const executionId = await this.statusTracker.create(decision, request.routingRequest);
    await this.statusTracker.markRunning(executionId);
    await this.deps.writeExecutionStarted?.(executionId, request.routingRequest.application, {
      routingDecisionId: decision.id,
      requestId: request.requestId ?? null,
      rationaleId: rationale.id,
    });

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
      await this.deps.writeExecutionCompleted?.(executionId, request.routingRequest.application, {
        status: 'succeeded',
        selectedProviderId: decision.selectedProviderId,
        latencyMs: response.latencyMs,
        fallbackUsed: false,
      });

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
        await this.deps.writeExecutionFailed?.(executionId, request.routingRequest.application, {
          status: 'failed',
          errorMessage,
          fallbackUsed: decision.fallbackChain.length > 0,
        });
        throw error;
      }

      const attempts = this.fallbackTracker
        .getAttempts(executionId)
        .filter((attempt) => attempt.status === 'failed' || attempt.status === 'succeeded');
      const successfulAttempt = attempts.find((attempt) => attempt.status === 'succeeded');
      await this.deps.writeRouteFallback?.(decision.id, request.routingRequest.application, {
        executionId,
        attempts: attempts.length,
        finalProviderId: successfulAttempt?.entry.providerId ?? decision.selectedProviderId,
      });
      await this.deps.writeExecutionCompleted?.(executionId, request.routingRequest.application, {
        status: 'fallback_succeeded',
        fallbackUsed: true,
        fallbackAttempts: attempts.length,
        finalProviderId: successfulAttempt?.entry.providerId ?? decision.selectedProviderId,
        latencyMs: fallbackResponse.latencyMs,
      });

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
