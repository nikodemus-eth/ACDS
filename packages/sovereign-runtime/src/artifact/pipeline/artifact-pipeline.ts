import type { ArtifactRegistry } from '../artifact-registry.js';
import type { ArtifactEnvelope, ProviderFamily } from '../artifact-envelope.js';
import { createBlockedEnvelope, createFailedEnvelope } from '../artifact-envelope.js';
import type { CapabilityOrchestrator } from '../../runtime/capability-orchestrator.js';
import type { CapabilityRegistry } from '../../registry/capability-registry.js';
import type { FamilyNormalizer } from './family-normalizer.js';
import type { PipelineContext, PipelineOptions, PipelineStage } from './pipeline-types.js';
import { IntakeStage } from './intake-stage.js';
import { PolicyGateStage } from './policy-gate-stage.js';
import { PlanningStage } from './planning-stage.js';
import { ExecutionStage } from './execution-stage.js';
import { PostProcessingStage } from './post-processing-stage.js';
import { ProvenanceStage } from './provenance-stage.js';
import { DeliveryStage, assembleEnvelope } from './delivery-stage.js';

// ---------------------------------------------------------------------------
// Artifact Pipeline — orchestrates the 7-stage artifact lifecycle
// ---------------------------------------------------------------------------

export interface ArtifactPipelineDeps {
  registry: ArtifactRegistry;
  capabilityRegistry: CapabilityRegistry;
  capabilityOrchestrator: CapabilityOrchestrator;
  familyNormalizers?: Map<string, FamilyNormalizer>;
}

export class ArtifactPipeline {
  private readonly stages: PipelineStage[];
  private readonly registry: ArtifactRegistry;
  private readonly normalizers: Map<string, FamilyNormalizer>;

  constructor(deps: ArtifactPipelineDeps) {
    this.registry = deps.registry;
    this.normalizers = deps.familyNormalizers ?? new Map();

    this.stages = [
      new IntakeStage(deps.registry, this.normalizers),
      new PolicyGateStage(),
      new PlanningStage(deps.capabilityRegistry),
      new ExecutionStage(deps.capabilityOrchestrator),
      new PostProcessingStage(this.normalizers),
      new ProvenanceStage(),
      new DeliveryStage(),
    ];
  }

  async execute(
    artifactType: string,
    input: unknown,
    options?: Partial<PipelineOptions>,
  ): Promise<ArtifactEnvelope> {
    const ctx: PipelineContext = {
      artifactType,
      rawInput: input,
      options: {
        requestedBy: options?.requestedBy ?? 'system',
        constraints: options?.constraints,
        skipValidation: options?.skipValidation,
      },
      timings: {},
      startTime: performance.now(),
    };

    // Run each stage sequentially. Stages propagate errors via ctx.error
    // rather than throwing, so the pipeline always completes.
    for (const stage of this.stages) {
      try {
        await stage.execute(ctx);
      } catch (err) {
        ctx.error = {
          stage: stage.name,
          message: err instanceof Error ? err.message : 'Unexpected pipeline error',
          code: 'PIPELINE_ERROR',
        };
        // Continue to remaining stages so timing/provenance are recorded
      }
    }

    // Assemble the final envelope
    if (ctx.error) {
      return this.buildErrorEnvelope(ctx);
    }

    return assembleEnvelope(ctx);
  }

  private buildErrorEnvelope(ctx: PipelineContext): ArtifactEnvelope {
    const entry = ctx.registryEntry;
    const error = ctx.error!;

    if (error.code === 'ARTIFACT_BLOCKED' || error.code === 'POLICY_BLOCKED') {
      return createBlockedEnvelope(
        ctx.artifactType,
        entry?.artifact_version ?? '0.0.0',
        error.message,
        ctx.policyDecision?.trace ?? [`${error.stage}: ${error.message}`],
      );
    }

    return createFailedEnvelope(
      ctx.artifactType,
      entry?.artifact_version ?? '0.0.0',
      error.message,
      ctx.selectedProvider ?? 'unknown',
      (ctx.selectedProviderFamily ?? 'custom') as ProviderFamily,
    );
  }
}
