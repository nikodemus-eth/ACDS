import type { PipelineContext, PipelineStage } from './pipeline-types.js';
import type { CapabilityOrchestrator, CapabilityResponse } from '../../runtime/capability-orchestrator.js';

// ---------------------------------------------------------------------------
// Stage 4: Execution
// ---------------------------------------------------------------------------

export class ExecutionStage implements PipelineStage {
  readonly name = 'execution';

  constructor(private readonly capabilityOrchestrator: CapabilityOrchestrator) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const start = performance.now();

    if (!ctx.capabilityId || !ctx.normalizedInput || ctx.error) {
      ctx.error = ctx.error ?? {
        stage: this.name,
        message: 'Cannot execute: prior stage failed',
        code: 'ARTIFACT_BLOCKED',
      };
      ctx.timings[this.name] = performance.now() - start;
      return ctx;
    }

    try {
      const response: CapabilityResponse = await this.capabilityOrchestrator.request({
        capability: ctx.capabilityId,
        input: ctx.normalizedInput,
        constraints: ctx.options.constraints,
      });

      ctx.rawOutput = response.output;
      ctx.executionLatencyMs = response.metadata.latencyMs;
      ctx.executionMode = response.metadata.executionMode;
      ctx.selectedProvider = response.metadata.providerId;
      ctx.selectedMethod = response.metadata.methodId;
      ctx.fallbackUsed = response.decision.fallbackAvailable && response.metadata.providerId !== ctx.selectedProvider;
    } catch (err) {
      ctx.error = {
        stage: this.name,
        message: err instanceof Error ? err.message : 'Execution failed',
        code: 'PROVIDER_UNAVAILABLE',
      };
    }

    ctx.timings[this.name] = performance.now() - start;
    return ctx;
  }
}
