import type { MethodDefinition } from '../domain/method-registry.js';
import type { SourceRegistry } from '../registry/registry.js';
import type { SourceClass } from '../domain/source-types.js';
import { InvalidExecutionPlanError } from '../domain/errors.js';
import { validateFallbackClass } from './policy-engine.js';

export interface ExecutionPlan {
  /** Primary execution target. */
  primary: {
    providerId: string;
    methodId: string;
    executionMode: 'local' | 'controlled_remote' | 'session';
  };
  /** Optional same-class fallback. Undefined if no fallback is available. */
  fallback?: {
    providerId: string;
    methodId: string;
    executionMode: 'local' | 'controlled_remote' | 'session';
  };
  /** The source class this plan operates within. */
  executionClass: SourceClass;
}

/**
 * Produces an execution plan with a primary target and optional same-class fallback.
 *
 * Rules:
 * - Provider plans get provider fallbacks only.
 * - Capability plans are isolated — no provider fallback.
 * - Session plans are isolated — no provider fallback.
 * - Cross-class fallback is always rejected.
 */
export function buildExecutionPlan(
  method: MethodDefinition,
  executionClass: SourceClass,
  registry: SourceRegistry,
  options?: { fallbackProviderId?: string; fallbackMethodId?: string },
): ExecutionPlan {
  const source = registry.getSource(method.providerId);
  const executionMode =
    executionClass === 'session'
      ? 'session' as const
      : source?.sourceClass === 'provider' && 'executionMode' in source
        ? source.executionMode
        : 'controlled_remote' as const;

  const plan: ExecutionPlan = {
    primary: {
      providerId: method.providerId,
      methodId: method.methodId,
      executionMode,
    },
    executionClass,
  };

  // Capabilities and sessions are isolated — no fallback
  if (executionClass !== 'provider') {
    if (options?.fallbackProviderId) {
      throw new InvalidExecutionPlanError(
        `${executionClass} execution plans do not support fallback`,
        { executionClass },
      );
    }
    return plan;
  }

  // Add same-class fallback if provided
  if (options?.fallbackProviderId && options?.fallbackMethodId) {
    const fallbackDecision = validateFallbackClass(
      executionClass,
      options.fallbackProviderId,
      registry,
    );

    if (!fallbackDecision.allowed) {
      throw new InvalidExecutionPlanError(
        fallbackDecision.reason ?? 'Cross-class fallback rejected',
        fallbackDecision.details,
      );
    }

    const fallbackSource = registry.getSource(options.fallbackProviderId);
    const fallbackMode =
      fallbackSource?.sourceClass === 'provider' && 'executionMode' in fallbackSource
        ? fallbackSource.executionMode
        : 'controlled_remote' as const;

    plan.fallback = {
      providerId: options.fallbackProviderId,
      methodId: options.fallbackMethodId,
      executionMode: fallbackMode,
    };
  }

  return plan;
}
