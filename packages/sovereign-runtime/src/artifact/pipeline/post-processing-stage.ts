import type { PipelineContext, PipelineStage } from './pipeline-types.js';
import type { FamilyNormalizer } from './family-normalizer.js';

// ---------------------------------------------------------------------------
// Stage 5: Post-Processing
// ---------------------------------------------------------------------------

export class PostProcessingStage implements PipelineStage {
  readonly name = 'post_processing';

  constructor(private readonly normalizers: Map<string, FamilyNormalizer>) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const start = performance.now();

    if (ctx.error || ctx.rawOutput === undefined) {
      ctx.error = ctx.error ?? {
        stage: this.name,
        message: 'Cannot post-process: no execution output',
        code: 'ARTIFACT_BLOCKED',
      };
      ctx.timings[this.name] = performance.now() - start;
      return ctx;
    }

    const family = ctx.registryEntry?.family;
    const normalizer = family ? this.normalizers.get(family) : undefined;

    if (normalizer && ctx.registryEntry) {
      try {
        ctx.canonicalPayload = normalizer.normalizeOutput(ctx.rawOutput, ctx.registryEntry);
      } catch (err) {
        ctx.error = {
          stage: this.name,
          message: err instanceof Error ? err.message : 'Output normalization failed',
          code: 'VALIDATION_FAILED',
        };
        ctx.timings[this.name] = performance.now() - start;
        return ctx;
      }
    } else {
      // Passthrough: wrap raw output as primary payload
      ctx.canonicalPayload = { primary: ctx.rawOutput };
    }

    ctx.timings[this.name] = performance.now() - start;
    return ctx;
  }
}
