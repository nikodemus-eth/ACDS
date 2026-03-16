import type { RoutingRequest } from '@acds/core-types';

export class RoutingRequestNormalizer {
  normalize(request: RoutingRequest): RoutingRequest {
    return {
      ...request,
      application: request.application.trim().toLowerCase(),
      process: request.process.trim().toLowerCase(),
      step: request.step.trim().toLowerCase(),
      constraints: {
        ...request.constraints,
        maxLatencyMs: request.constraints.maxLatencyMs ?? null,
      },
      instanceContext: request.instanceContext
        ? {
            ...request.instanceContext,
            retryCount: request.instanceContext.retryCount ?? 0,
            previousFailures: request.instanceContext.previousFailures ?? [],
            deadlinePressure: request.instanceContext.deadlinePressure ?? false,
            humanReviewStatus: request.instanceContext.humanReviewStatus ?? 'none',
            additionalMetadata: request.instanceContext.additionalMetadata ?? {},
          }
        : undefined,
    };
  }
}
