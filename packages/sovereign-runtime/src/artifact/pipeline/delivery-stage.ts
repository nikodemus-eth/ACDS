import type { PipelineContext, PipelineStage } from './pipeline-types.js';
import type { ArtifactEnvelope } from '../artifact-envelope.js';
import { ENVELOPE_VERSION, generateArtifactId } from '../artifact-envelope.js';

// ---------------------------------------------------------------------------
// Stage 7: Delivery — assembles the final ArtifactEnvelope
// ---------------------------------------------------------------------------

export class DeliveryStage implements PipelineStage {
  readonly name = 'delivery';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const start = performance.now();
    ctx.timings[this.name] = performance.now() - start;
    // Envelope assembly happens in the pipeline runner, not here.
    // This stage exists for GRITS hook integration and final checks.
    return ctx;
  }
}

/**
 * Assembles a complete ArtifactEnvelope from a finished PipelineContext.
 */
export function assembleEnvelope(ctx: PipelineContext): ArtifactEnvelope {
  const entry = ctx.registryEntry;
  const now = new Date().toISOString();

  const envelope: ArtifactEnvelope = {
    // Layer 1: Identity
    envelope_version: ENVELOPE_VERSION,
    artifact_id: generateArtifactId(),
    artifact_type: ctx.artifactType,
    artifact_version: entry?.artifact_version ?? '0.0.0',
    status: 'succeeded',
    created_at: now,

    // Layer 2: Contract
    provider: ctx.selectedProvider ?? 'unknown',
    provider_family: ctx.selectedProviderFamily ?? 'custom',
    output_modality: ctx.outputModality ?? 'text',
    output_format: ctx.outputFormat ?? 'plain_text',

    // Layer 3: Input Summary
    input_summary: ctx.inputSummary ?? {
      source_modality: 'unknown',
      input_class: 'unknown',
      input_size: 0,
      summary: '',
    },

    // Layer 4: Payload
    payload: ctx.canonicalPayload ?? { primary: ctx.rawOutput ?? {} },

    // Layer 5: Provenance
    provenance: ctx.provenance ?? {
      provider_route: 'unknown',
      method: 'unknown',
      requested_by: ctx.options.requestedBy ?? 'system',
      execution_started_at: new Date(ctx.startTime).toISOString(),
      execution_completed_at: now,
      normalizations: [],
    },

    // Layer 6: Policy
    policy: {
      provider_eligibility: ctx.policyDecision?.allowed ? 'allowed' : 'blocked',
      local_only_requirement: ctx.policyDecision?.local_only ?? false,
      content_policy_result: 'passed',
      consent_required: false,
      retention_policy: 'ephemeral_preview_plus_artifact_log',
      policy_trace: ctx.policyDecision?.trace ?? [],
    },

    // Layer 7: Limitations
    limitations: {
      quality_tier: entry?.quality_tier ?? 'consumer_demo_grade',
      known_constraints: entry ? [] : ['unregistered artifact type'],
    },
  };

  // Optional: Execution metadata
  const totalMs = Object.values(ctx.timings).reduce((a, b) => a + b, 0);
  envelope.execution = {
    duration_ms: Math.round(totalMs),
    fallback_used: ctx.fallbackUsed ?? false,
    retries: 0,
  };

  // Optional: Fallback info
  if (ctx.fallbackUsed) {
    envelope.fallback = {
      attempted: true,
      fallback_provider: ctx.fallbackProvider,
      reason: 'primary provider unavailable',
    };
  }

  return envelope;
}
