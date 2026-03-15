import type { RoutingDecision } from '@acds/core-types';
import type { AdapterRequest, AdapterResponse } from '@acds/provider-adapters';
import type { ExecutionStatusTracker } from '../run/ExecutionStatusTracker.js';
import type { FallbackDecisionTracker } from './FallbackDecisionTracker.js';

export interface FallbackExecutionDeps {
  executeProvider(providerId: string, request: AdapterRequest, apiKey?: string): Promise<AdapterResponse>;
  resolveApiKey(providerId: string): Promise<string | undefined>;
}

export class FallbackExecutionService {
  constructor(
    private readonly statusTracker: ExecutionStatusTracker,
    private readonly fallbackTracker: FallbackDecisionTracker,
    private readonly deps: FallbackExecutionDeps
  ) {}

  async executeFallbacks(
    executionId: string,
    decision: RoutingDecision,
    adapterRequest: AdapterRequest,
    originalError: string
  ): Promise<AdapterResponse | null> {
    const chain = decision.fallbackChain;
    if (chain.length === 0) return null;

    for (const entry of chain) {
      this.fallbackTracker.recordAttempt(executionId, entry, originalError);

      try {
        const apiKey = await this.deps.resolveApiKey(entry.providerId);
        const request = { ...adapterRequest, model: entry.modelProfileId };
        const response = await this.deps.executeProvider(entry.providerId, request, apiKey);

        this.fallbackTracker.recordSuccess(executionId, entry);
        await this.statusTracker.markFallbackSucceeded(executionId);
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown';
        console.error(
          `[fallback-execution] Attempt failed for execution ${executionId}, ` +
          `provider ${entry.providerId}, model ${entry.modelProfileId}: ${message}`,
        );
        this.fallbackTracker.recordFailure(executionId, entry, message);
      }
    }

    console.error(
      `[fallback-execution] All ${chain.length} fallback(s) exhausted for execution ${executionId}. ` +
      `Original error: ${originalError}`,
    );
    await this.statusTracker.markFallbackFailed(executionId);
    return null;
  }
}
