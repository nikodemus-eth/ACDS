/**
 * Response Assembler — Assembles final ACDSMethodResponse.
 */
import type { ExecutionPlan } from "./execution-planner.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------
export interface ACDSMethodResponse {
  output: unknown;
  metadata: {
    provider_id: string;
    method_id: string;
    execution_mode: "local" | "controlled_remote" | "session";
    deterministic: boolean;
    latency_ms: number;
    validated: boolean;
    warnings?: string[];
  };
}

export interface ExecutionResult {
  executed: boolean;
  output: unknown;
  latency_ms?: number;
}

// ---------------------------------------------------------------------------
// Assembler
// ---------------------------------------------------------------------------
export function assembleResponse(
  plan: ExecutionPlan,
  result: ExecutionResult,
): ACDSMethodResponse {
  const mode = plan.primary.execution_mode as "local" | "controlled_remote" | "session";
  const deterministic = mode === "local";

  return {
    output: result.output,
    metadata: {
      provider_id: plan.primary.provider_id,
      method_id: plan.primary.method_id,
      execution_mode: mode,
      deterministic,
      latency_ms: result.latency_ms ?? 0,
      validated: true,
    },
  };
}
