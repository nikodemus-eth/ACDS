import type { PipelineContext, PipelineStage } from './pipeline-types.js';
import type { ArtifactRegistry } from '../artifact-registry.js';
import type { FamilyNormalizer } from './family-normalizer.js';

// ---------------------------------------------------------------------------
// Stage 1: Intake
// ---------------------------------------------------------------------------

export class IntakeStage implements PipelineStage {
  readonly name = 'intake';

  constructor(
    private readonly registry: ArtifactRegistry,
    private readonly normalizers: Map<string, FamilyNormalizer>,
  ) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const start = performance.now();

    // 1. Resolve artifact type from registry
    const entry = this.registry.getEntry(ctx.artifactType);
    if (!entry) {
      ctx.error = {
        stage: this.name,
        message: `Unknown artifact type: ${ctx.artifactType}`,
        code: 'ARTIFACT_REGISTRY_ERROR',
      };
      ctx.timings[this.name] = performance.now() - start;
      return ctx;
    }

    ctx.registryEntry = entry;
    ctx.capabilityId = entry.capability_id;
    ctx.outputModality = entry.output_modality;
    ctx.outputFormat = entry.output_format;

    // 2. Normalize input via family normalizer
    const normalizer = this.normalizers.get(entry.family);
    if (normalizer) {
      try {
        ctx.normalizedInput = normalizer.normalizeInput(ctx.rawInput, entry);
        ctx.inputSummary = normalizer.summarizeInput(ctx.rawInput, entry);
      } catch (err) {
        ctx.error = {
          stage: this.name,
          message: err instanceof Error ? err.message : 'Input normalization failed',
          code: 'VALIDATION_FAILED',
        };
        ctx.timings[this.name] = performance.now() - start;
        return ctx;
      }
    } else {
      // Passthrough if no normalizer registered
      ctx.normalizedInput = ctx.rawInput;
      ctx.inputSummary = {
        source_modality: 'unknown',
        input_class: 'raw',
        input_size: JSON.stringify(ctx.rawInput ?? {}).length,
        summary: `Raw input for ${ctx.artifactType}`,
      };
    }

    ctx.timings[this.name] = performance.now() - start;
    return ctx;
  }
}
