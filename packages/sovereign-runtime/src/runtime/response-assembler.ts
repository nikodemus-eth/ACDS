import type { ACDSMethodResponse } from '../domain/execution-response.js';
import type { MethodExecutionResult } from '../providers/provider-runtime.js';
import type { ExecutionPlan } from './execution-planner.js';

/**
 * Assembles a structured ACDSMethodResponse from execution results.
 */
export function assembleResponse(
  result: MethodExecutionResult,
  plan: ExecutionPlan,
  validated: boolean,
  warnings?: string[],
): ACDSMethodResponse {
  return {
    output: result.output,
    metadata: {
      providerId: plan.primary.providerId,
      methodId: plan.primary.methodId,
      executionMode: plan.primary.executionMode,
      deterministic: result.deterministic,
      latencyMs: result.latencyMs,
      validated,
      ...(warnings && warnings.length > 0 ? { warnings } : {}),
    },
  };
}
