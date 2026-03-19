/**
 * GRITS Hooks — runtime hooks that fire after execution.
 *
 * Provides post-execution validation for method results,
 * policy decisions, and fallback events.
 */
import type { MethodExecutionResult } from "../providers/provider-runtime.js";
import type { MethodDefinition } from "../domain/method-registry.js";
import type { PolicyDecision } from "../runtime/policy-engine.js";
import type { GritsValidationResult } from "./validation-types.js";
import { validateSchema, type SchemaExpectation } from "./schema-validator.js";
import { validateLatency } from "./latency-validator.js";

export class GritsHooks {
  /**
   * Validate execution result against method definition expectations.
   */
  onExecution(
    result: MethodExecutionResult,
    method: MethodDefinition,
  ): GritsValidationResult[] {
    const results: GritsValidationResult[] = [];

    // Schema validation if output_schema has required keys
    const schemaKeys = Object.keys(method.output_schema);
    if (schemaKeys.length > 0) {
      const expectation: SchemaExpectation = {
        required_keys: schemaKeys,
      };
      results.push(
        validateSchema(result.output, expectation, `GRITS-EXEC-SCHEMA-${method.method_id}`),
      );
    }

    // Latency validation
    results.push(
      validateLatency(
        result.latency_ms,
        result.execution_mode,
        `GRITS-EXEC-LATENCY-${method.method_id}`,
      ),
    );

    // Overall execution validation
    const now = new Date().toISOString();
    results.push({
      test_id: `GRITS-EXEC-${method.method_id}`,
      passed: result.output !== null && result.output !== undefined,
      severity: result.output !== null && result.output !== undefined ? "low" : "critical",
      category: "execution",
      details:
        result.output !== null && result.output !== undefined
          ? `Execution succeeded for ${method.method_id}`
          : `Execution produced null/undefined for ${method.method_id}`,
      timestamp: now,
    });

    return results;
  }

  /**
   * Validate a policy decision.
   */
  onPolicyDecision(decision: PolicyDecision): GritsValidationResult[] {
    const now = new Date().toISOString();
    return [
      {
        test_id: `GRITS-POLICY-${decision.reason_code}`,
        passed: true,
        severity: decision.allowed ? "low" : "medium",
        category: "policy",
        details: `Policy decision: ${decision.reason_code} - ${decision.details}`,
        timestamp: now,
      },
    ];
  }

  /**
   * Validate a fallback event.
   */
  onFallback(
    primary: string,
    fallback: string,
    reason: string,
  ): GritsValidationResult[] {
    const now = new Date().toISOString();
    return [
      {
        test_id: `GRITS-FALLBACK-${primary}`,
        passed: true,
        severity: "medium",
        category: "fallback",
        details: `Fallback triggered: ${primary} -> ${fallback}, reason: ${reason}`,
        timestamp: now,
      },
    ];
  }
}
