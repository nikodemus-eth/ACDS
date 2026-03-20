import type { PipelineContext, PipelineStage } from './pipeline-types.js';

// ---------------------------------------------------------------------------
// Stage 6: Provenance and Policy Record
// ---------------------------------------------------------------------------

export class ProvenanceStage implements PipelineStage {
  readonly name = 'provenance';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const start = performance.now();

    if (ctx.error) {
      ctx.timings[this.name] = performance.now() - start;
      return ctx;
    }

    const now = new Date().toISOString();
    const executionStart = new Date(ctx.startTime).toISOString();

    ctx.provenance = {
      provider_route: `${ctx.registryEntry?.family ?? 'unknown'}.${ctx.selectedProvider ?? 'unknown'}`,
      method: ctx.selectedMethod ?? 'unknown',
      requested_by: ctx.options.requestedBy ?? 'system',
      execution_started_at: executionStart,
      execution_completed_at: now,
      normalizations: ctx.registryEntry
        ? [`mapped provider output into canonical ${ctx.registryEntry.family} payload`]
        : [],
    };

    ctx.timings[this.name] = performance.now() - start;
    return ctx;
  }
}
