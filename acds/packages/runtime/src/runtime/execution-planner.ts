/**
 * Execution Planner — Builds execution plan from policy-approved method.
 *
 * Assigns primary target, optional same-class fallback,
 * and rejects cross-class fallback unconditionally.
 */
import { CrossClassFallbackBlockedError } from "../domain/errors.js";
import type { Registry } from "../registry/registry.js";
import type { ResolvedMethod } from "./method-resolver.js";
import type { PolicyDecision } from "./policy-engine.js";
import type { SourceClass } from "../domain/source-types.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------
export interface ExecutionTarget {
  provider_id: string;
  method_id: string;
  execution_mode: string;
}

export interface ExecutionPlan {
  plan_id: string;
  primary: ExecutionTarget;
  fallback?: ExecutionTarget;
  constraints: {
    local_only: boolean;
    max_latency_ms?: number;
  };
}

export interface PlannerOptions {
  local_only?: boolean;
  max_latency_ms?: number;
  fallback_method_id?: string;
  fallback_source_class?: SourceClass;
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------
let planCounter = 0;

export function buildExecutionPlan(
  resolved: ResolvedMethod,
  policy: PolicyDecision,
  registry: Registry,
  options: PlannerOptions = {},
): ExecutionPlan {
  planCounter += 1;
  const plan_id = `plan-${planCounter}`;

  // Determine execution mode from provider descriptor or fallback defaults
  let executionMode = "local";
  if (resolved.source_class === "provider") {
    const provider = registry.getProvider(resolved.provider_id);
    if (provider) {
      executionMode = provider.execution_mode;
    }
  } else if (resolved.source_class === "capability") {
    executionMode = "controlled_remote";
  } else if (resolved.source_class === "session") {
    executionMode = "session";
  }

  const primary: ExecutionTarget = {
    provider_id: resolved.provider_id,
    method_id: resolved.method_id,
    execution_mode: executionMode,
  };

  const plan: ExecutionPlan = {
    plan_id,
    primary,
    constraints: {
      local_only: options.local_only ?? false,
      max_latency_ms: options.max_latency_ms,
    },
  };

  // Cross-class fallback check
  if (options.fallback_method_id && options.fallback_source_class) {
    if (options.fallback_source_class !== resolved.source_class) {
      throw new CrossClassFallbackBlockedError(
        `Cross-class fallback blocked: primary=${resolved.source_class}, fallback=${options.fallback_source_class}`,
      );
    }

    // Same-class fallback: look up method in registry for provider path
    if (resolved.source_class === "provider") {
      const fallbackMethod = registry.getMethod(options.fallback_method_id);
      if (fallbackMethod) {
        const fallbackProvider = registry.getProvider(fallbackMethod.provider_id);
        plan.fallback = {
          provider_id: fallbackMethod.provider_id,
          method_id: fallbackMethod.method_id,
          execution_mode: fallbackProvider!.execution_mode,
        };
      }
    }
  }

  return plan;
}
