import type { ACDSMethodRequest } from '../domain/execution-request.js';
import type { ACDSMethodResponse } from '../domain/execution-response.js';
import type { SourceRegistry } from '../registry/registry.js';
import type { ProviderRuntime } from '../providers/provider-runtime.js';
import { resolveIntent } from './intent-resolver.js';
import { resolveMethod } from './method-resolver.js';
import { evaluatePolicy } from './policy-engine.js';
import { buildExecutionPlan } from './execution-planner.js';
import { assembleResponse } from './response-assembler.js';
import {
  ACDSRuntimeError,
  MethodUnresolvedError,
  ProviderUnavailableError,
  PolicyBlockedError,
} from '../domain/errors.js';

export interface FallbackMapping {
  /** Primary method ID → { fallbackProviderId, fallbackMethodId } */
  [methodId: string]: { fallbackProviderId: string; fallbackMethodId: string };
}

export interface OrchestratorDeps {
  registry: SourceRegistry;
  runtimes: Map<string, ProviderRuntime>;
  /** Optional GRITS validation hook — called after execution. */
  onValidate?: (response: ACDSMethodResponse) => { validated: boolean; warnings: string[] };
  /** Optional fallback mappings for same-class provider fallback. */
  fallbackMap?: FallbackMapping;
}

/**
 * The top-level runtime orchestrator.
 * Wires the full pipeline: task → intent → method → policy → plan → execute → validate → respond.
 */
export class RuntimeOrchestrator {
  private readonly registry: SourceRegistry;
  private readonly runtimes: Map<string, ProviderRuntime>;
  private readonly onValidate?: (response: ACDSMethodResponse) => { validated: boolean; warnings: string[] };
  private readonly fallbackMap: FallbackMapping;

  constructor(deps: OrchestratorDeps) {
    this.registry = deps.registry;
    this.runtimes = deps.runtimes;
    this.onValidate = deps.onValidate;
    this.fallbackMap = deps.fallbackMap ?? {};
  }

  /**
   * Execute a task through the full ACDS pipeline.
   */
  async executeTask(task: string, request: Partial<ACDSMethodRequest> = {}): Promise<ACDSMethodResponse> {
    // 1. Resolve intent
    const resolved = resolveIntent(task);
    if (!resolved) {
      throw new MethodUnresolvedError(task);
    }

    // 2. Resolve method
    const { method, isOverride } = resolveMethod(resolved.intent, this.registry, {
      useCapability: request.useCapability,
    });

    // 3. Evaluate policy
    const fullRequest: ACDSMethodRequest = {
      providerId: method.providerId,
      methodId: method.methodId,
      input: request.input ?? {},
      context: request.context,
      constraints: request.constraints,
      useCapability: request.useCapability,
      useSession: request.useSession,
      riskAcknowledged: request.riskAcknowledged,
    };

    const policy = evaluatePolicy(fullRequest, method, this.registry, isOverride);
    if (!policy.allowed) {
      throw new PolicyBlockedError(policy.reason!, policy.details);
    }

    // 4. Build execution plan (with optional fallback from config)
    const fallbackEntry = this.fallbackMap[method.methodId];
    const plan = buildExecutionPlan(method, policy.executionClass, this.registry, fallbackEntry);

    // 5. Execute via provider runtime
    const runtime = this.runtimes.get(plan.primary.providerId);
    if (!runtime) {
      throw new ProviderUnavailableError(plan.primary.providerId);
    }

    const available = await runtime.isAvailable();
    if (!available) {
      // Try fallback if available
      if (plan.fallback) {
        const fallbackRuntime = this.runtimes.get(plan.fallback.providerId);
        if (fallbackRuntime && (await fallbackRuntime.isAvailable())) {
          try {
            const result = await fallbackRuntime.execute(plan.fallback.methodId, fullRequest.input);
            const response = assembleResponse(result, {
              ...plan,
              primary: plan.fallback,
            }, true);

            if (this.onValidate) {
              const validation = this.onValidate(response);
              response.metadata.validated = validation.validated;
              if (validation.warnings.length > 0) {
                response.metadata.warnings = validation.warnings;
              }
            }

            return response;
          } catch (error) {
            if (error instanceof ACDSRuntimeError) {
              throw error;
            }
            throw new ProviderUnavailableError(plan.fallback.providerId);
          }
        }
      }
      throw new ProviderUnavailableError(plan.primary.providerId);
    }

    try {
      const result = await runtime.execute(plan.primary.methodId, fullRequest.input);

      // 6. Assemble response
      const response = assembleResponse(result, plan, true);

      // 7. GRITS validation hook
      if (this.onValidate) {
        const validation = this.onValidate(response);
        response.metadata.validated = validation.validated;
        if (validation.warnings.length > 0) {
          response.metadata.warnings = validation.warnings;
        }
      }

      return response;
    } catch (error) {
      if (error instanceof ACDSRuntimeError) {
        throw error;
      }
      throw new ProviderUnavailableError(plan.primary.providerId);
    }
  }

  /**
   * Execute a direct method request (bypasses intent resolution).
   */
  async executeMethod(request: ACDSMethodRequest): Promise<ACDSMethodResponse> {
    const method = this.registry.getMethod(request.methodId);
    if (!method) {
      throw new MethodUnresolvedError(request.methodId);
    }

    const policy = evaluatePolicy(request, method, this.registry, false);
    if (!policy.allowed) {
      throw new PolicyBlockedError(policy.reason!, policy.details);
    }

    const plan = buildExecutionPlan(method, policy.executionClass, this.registry);

    const runtime = this.runtimes.get(plan.primary.providerId);
    if (!runtime) {
      throw new ProviderUnavailableError(plan.primary.providerId);
    }

    const available = await runtime.isAvailable();
    if (!available) {
      throw new ProviderUnavailableError(plan.primary.providerId);
    }

    try {
      const result = await runtime.execute(plan.primary.methodId, request.input);
      const response = assembleResponse(result, plan, true);

      if (this.onValidate) {
        const validation = this.onValidate(response);
        response.metadata.validated = validation.validated;
        if (validation.warnings.length > 0) {
          response.metadata.warnings = validation.warnings;
        }
      }

      return response;
    } catch (error) {
      if (error instanceof ACDSRuntimeError) {
        throw error;
      }
      throw new ProviderUnavailableError(plan.primary.providerId);
    }
  }
}
