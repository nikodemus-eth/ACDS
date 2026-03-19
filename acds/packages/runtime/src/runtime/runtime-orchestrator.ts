/**
 * Runtime Orchestrator — Wires the full pipeline.
 *
 * Request -> Intent Resolver -> Method Resolver -> Policy Engine
 *        -> Execution Planner -> Provider Runtime -> Response Assembler
 *        -> Telemetry + GRITS Hooks
 */
import type { Registry } from "../registry/registry.js";
import type { ProviderRuntime } from "../providers/provider-runtime.js";
import { resolveIntent, type IntentResolutionInput } from "./intent-resolver.js";
import { resolveMethod } from "./method-resolver.js";
import { evaluatePolicy, type PolicyConstraints } from "./policy-engine.js";
import { buildExecutionPlan, type PlannerOptions } from "./execution-planner.js";
import { assembleResponse, type ACDSMethodResponse, type ExecutionResult } from "./response-assembler.js";
import { PolicyBlockedError, ProviderUnavailableError, MethodNotAvailableError } from "../domain/errors.js";
import { ExecutionLogger } from "../telemetry/execution-logger.js";
import { AuditLogger } from "../telemetry/audit-logger.js";
import { GritsHooks } from "../grits/grits-hooks.js";
import { generateEventId, generateExecutionId } from "../telemetry/event-types.js";
import type { TelemetryEvent } from "../telemetry/event-types.js";
import type { GritsValidationResult } from "../grits/validation-types.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------
export interface RuntimeRequest {
  task: string;
  input?: unknown;
  use_capability?: string;
  use_session?: string;
  risk_acknowledged?: boolean;
  explicit_approval?: boolean;
  local_only?: boolean;
  max_latency_ms?: number;
  fallback_method_id?: string;
  fallback_source_class?: "provider" | "capability" | "session";
}

export interface OrchestratorOptions {
  executionLogger?: ExecutionLogger;
  auditLogger?: AuditLogger;
  gritsHooks?: GritsHooks;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
export async function executeRequest(
  request: RuntimeRequest,
  registry: Registry,
  providers?: Map<string, ProviderRuntime>,
  options?: OrchestratorOptions,
): Promise<ACDSMethodResponse> {
  const executionLogger = options?.executionLogger;
  const auditLogger = options?.auditLogger;
  const gritsHooks = options?.gritsHooks;
  const execution_id = generateExecutionId();

  // Helper to log to both loggers
  function logEvent(event: TelemetryEvent): void {
    executionLogger?.log(event);
    auditLogger?.log(event);
  }

  // 1. Intent resolution
  const intent = resolveIntent({
    task: request.task,
    use_capability: request.use_capability,
    use_session: request.use_session,
    risk_acknowledged: request.risk_acknowledged,
  });

  // 2. Method resolution
  const resolved = resolveMethod(intent, registry);

  // Log execution started
  logEvent({
    event_id: generateEventId(),
    event_type: "execution_started",
    timestamp: new Date().toISOString(),
    execution_id,
    source_type: resolved.source_class,
    source_id: resolved.provider_id,
    provider_id: resolved.provider_id,
    method_id: resolved.method_id,
    status: "success",
  });

  // 3. Policy evaluation
  const constraints: PolicyConstraints = {
    local_only: request.local_only,
    explicit_approval: request.explicit_approval,
    risk_acknowledged: request.risk_acknowledged,
  };
  const decision = evaluatePolicy(resolved, registry, constraints);

  // Log policy decision
  const policyEventType = decision.allowed ? "policy_allowed" : "policy_denied";
  logEvent({
    event_id: generateEventId(),
    event_type: policyEventType,
    timestamp: new Date().toISOString(),
    execution_id,
    source_type: resolved.source_class,
    source_id: resolved.provider_id,
    provider_id: resolved.provider_id,
    method_id: resolved.method_id,
    status: decision.allowed ? "success" : "blocked",
    policy_path: decision.reason_code,
    details: { reason_code: decision.reason_code, details: decision.details },
  });

  // GRITS: validate policy decision
  let gritsResults: GritsValidationResult[] = [];
  if (gritsHooks) {
    gritsResults.push(...gritsHooks.onPolicyDecision(decision));
  }

  if (!decision.allowed) {
    throw new PolicyBlockedError(
      `${decision.reason_code}: ${decision.details}`,
    );
  }

  // 4. Execution planning
  const plannerOptions: PlannerOptions = {
    local_only: request.local_only,
    max_latency_ms: request.max_latency_ms,
    fallback_method_id: request.fallback_method_id,
    fallback_source_class: request.fallback_source_class,
  };
  const plan = buildExecutionPlan(resolved, decision, registry, plannerOptions);

  // 5. Provider execution
  let result: ExecutionResult;
  let usedFallback = false;

  if (providers) {
    const provider = providers.get(plan.primary.provider_id);
    if (!provider) {
      throw new ProviderUnavailableError(plan.primary.provider_id);
    }

    // Check provider health
    const healthStatus = provider.health();
    if (healthStatus.state === "unavailable") {
      // Try fallback if available
      if (plan.fallback) {
        const fallbackProvider = providers.get(plan.fallback.provider_id);
        if (fallbackProvider && fallbackProvider.health().state !== "unavailable") {
          // Log fallback event
          logEvent({
            event_id: generateEventId(),
            event_type: "fallback_triggered",
            timestamp: new Date().toISOString(),
            execution_id,
            source_type: resolved.source_class,
            source_id: plan.fallback.provider_id,
            provider_id: plan.fallback.provider_id,
            method_id: plan.fallback.method_id,
            status: "success",
            details: {
              primary_provider: plan.primary.provider_id,
              fallback_provider: plan.fallback.provider_id,
              reason: "primary_unavailable",
            },
          });

          if (gritsHooks) {
            gritsResults.push(
              ...gritsHooks.onFallback(
                plan.primary.provider_id,
                plan.fallback.provider_id,
                "primary_unavailable",
              ),
            );
          }

          const execResult = await fallbackProvider.execute(
            plan.fallback.method_id,
            request.input,
          );
          result = {
            executed: true,
            output: execResult.output,
            latency_ms: execResult.latency_ms,
          };
          usedFallback = true;

          // GRITS: validate execution
          if (gritsHooks) {
            const fallbackMethod = registry.getMethod(plan.fallback.method_id);
            if (fallbackMethod) {
              gritsResults.push(...gritsHooks.onExecution(execResult, fallbackMethod));
            }
          }

          // Update plan primary to reflect fallback was used
          plan.primary.provider_id = plan.fallback.provider_id;
          plan.primary.method_id = plan.fallback.method_id;
          plan.primary.execution_mode = plan.fallback.execution_mode;

          // Log execution succeeded
          logEvent({
            event_id: generateEventId(),
            event_type: "execution_succeeded",
            timestamp: new Date().toISOString(),
            execution_id,
            source_type: resolved.source_class,
            source_id: plan.primary.provider_id,
            provider_id: plan.primary.provider_id,
            method_id: plan.primary.method_id,
            execution_mode: plan.primary.execution_mode as "local" | "controlled_remote" | "session",
            latency_ms: execResult.latency_ms,
            status: "success",
            validation_result: gritsResults.every((r) => r.passed) ? "passed" : "failed",
          });

          const response = assembleResponse(plan, result);
          if (gritsResults.length > 0) {
            response.metadata.warnings = gritsResults
              .filter((r) => !r.passed)
              .map((r) => r.details);
          }
          return response;
        }
      }
      throw new ProviderUnavailableError(plan.primary.provider_id);
    }

    if (!provider.supports(plan.primary.method_id)) {
      throw new MethodNotAvailableError(plan.primary.method_id);
    }

    const execResult = await provider.execute(
      plan.primary.method_id,
      request.input,
    );
    result = {
      executed: true,
      output: execResult.output,
      latency_ms: execResult.latency_ms,
    };

    // GRITS: validate execution
    if (gritsHooks) {
      const method = registry.getMethod(plan.primary.method_id);
      if (method) {
        gritsResults.push(...gritsHooks.onExecution(execResult, method));
      }
    }
  } else {
    // Fallback placeholder when no providers injected (backward compat)
    result = {
      executed: true,
      output: "placeholder",
      latency_ms: 0,
    };
  }

  // Log execution succeeded
  logEvent({
    event_id: generateEventId(),
    event_type: "execution_succeeded",
    timestamp: new Date().toISOString(),
    execution_id,
    source_type: resolved.source_class,
    source_id: plan.primary.provider_id,
    provider_id: plan.primary.provider_id,
    method_id: plan.primary.method_id,
    execution_mode: plan.primary.execution_mode as "local" | "controlled_remote" | "session",
    latency_ms: result.latency_ms,
    status: "success",
    validation_result: gritsResults.every((r) => r.passed) ? "passed" : "failed",
  });

  // 6. Response assembly
  const response = assembleResponse(plan, result);

  // Attach validation warnings to response metadata
  if (gritsResults.length > 0) {
    const warnings = gritsResults.filter((r) => !r.passed).map((r) => r.details);
    if (warnings.length > 0) {
      response.metadata.warnings = warnings;
    }
  }

  return response;
}
