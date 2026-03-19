import type { ACDSMethodResponse } from '../domain/execution-response.js';
import type { MethodDefinition } from '../domain/method-registry.js';
import type { ValidationResult, GRITSHookEvent } from './validation-types.js';
import { validateOutputSchema } from './schema-validator.js';
import { validateLatency } from './latency-validator.js';

export interface GRITSHookConfig {
  latencyThresholdMs?: number;
  validateSchema?: boolean;
}

/**
 * Runs the GRITS post-execution validation chain.
 * Returns aggregated validation results.
 */
export class GRITSHookRunner {
  private readonly config: Required<GRITSHookConfig>;
  private readonly events: GRITSHookEvent[] = [];

  constructor(config: GRITSHookConfig = {}) {
    this.config = {
      latencyThresholdMs: config.latencyThresholdMs ?? 5000,
      validateSchema: config.validateSchema ?? true,
    };
  }

  /**
   * Run all validation hooks against an execution response.
   */
  validate(
    response: ACDSMethodResponse,
    method?: MethodDefinition,
  ): { validated: boolean; warnings: string[] } {
    const results: ValidationResult[] = [];
    const executionId = `exec-${Date.now()}`;

    // Schema validation
    if (this.config.validateSchema && method?.outputSchema) {
      const schemaResult = validateOutputSchema(response.output, method.outputSchema);
      results.push(schemaResult);
      this.recordEvent('schema-validation', executionId, response, schemaResult);
    }

    // Latency validation
    const latencyResult = validateLatency(
      response.metadata.latencyMs,
      this.config.latencyThresholdMs,
    );
    results.push(latencyResult);
    this.recordEvent('latency-validation', executionId, response, latencyResult);

    // Aggregate results
    const failures = results.filter((r) => r.status === 'fail');
    const warnings = results
      .filter((r) => r.status === 'warning' || r.status === 'drift')
      .map((r) => r.message);

    return {
      validated: failures.length === 0,
      warnings,
    };
  }

  getEvents(): ReadonlyArray<GRITSHookEvent> {
    return this.events;
  }

  clearEvents(): void {
    this.events.length = 0;
  }

  private recordEvent(
    hookId: string,
    executionId: string,
    response: ACDSMethodResponse,
    result: ValidationResult,
  ): void {
    this.events.push({
      hookId,
      executionId,
      methodId: response.metadata.methodId,
      providerId: response.metadata.providerId,
      result,
      timestamp: new Date().toISOString(),
    });
  }
}
