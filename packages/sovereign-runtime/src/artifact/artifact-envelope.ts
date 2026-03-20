import { z } from 'zod';

// ---------------------------------------------------------------------------
// Core Enums
// ---------------------------------------------------------------------------

export const ARTIFACT_STATUS = ['succeeded', 'failed', 'partial', 'blocked'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUS)[number];

export const OUTPUT_MODALITIES = ['text', 'image', 'expression', 'vision_result', 'action_result', 'mixed'] as const;
export type OutputModality = (typeof OUTPUT_MODALITIES)[number];

export const PROVIDER_DISPOSITIONS = ['apple-only', 'apple-preferred', 'apple-optional'] as const;
export type ProviderDisposition = (typeof PROVIDER_DISPOSITIONS)[number];

export const QUALITY_TIERS = ['none', 'experimental', 'consumer_demo_grade', 'production_candidate', 'production'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export const PROVIDER_FAMILIES = ['apple', 'ollama', 'openai', 'anthropic', 'google', 'custom'] as const;
export type ProviderFamily = (typeof PROVIDER_FAMILIES)[number];

export const OUTPUT_FORMATS = ['plain_text', 'markdown', 'json', 'png', 'jpeg', 'svg', 'binary_ref'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

// ---------------------------------------------------------------------------
// Envelope Sub-Structures
// ---------------------------------------------------------------------------

export interface ArtifactInputSummary {
  source_modality: string;
  input_class: string;
  input_size: number;
  summary: string;
}

export interface ArtifactPayload {
  primary: unknown;
  secondary?: unknown;
}

export interface ArtifactProvenance {
  provider_route: string;
  method: string;
  requested_by: string;
  execution_started_at: string;
  execution_completed_at: string;
  normalizations: string[];
}

export interface ArtifactPolicy {
  provider_eligibility: string;
  local_only_requirement: boolean;
  content_policy_result: string;
  consent_required: boolean;
  retention_policy: string;
  policy_trace: string[];
}

export interface ArtifactLimitations {
  quality_tier: QualityTier;
  known_constraints: string[];
}

export interface ArtifactQuality {
  score: number;
  dimensions: Record<string, number>;
  evaluator: string;
}

export interface ArtifactConfidence {
  overall: number;
  basis: string;
}

export interface ArtifactPreview {
  text_excerpt?: string;
  thumbnail_uri?: string;
}

export interface ArtifactExecution {
  duration_ms: number;
  fallback_used: boolean;
  retries: number;
  node?: string;
}

export interface ArtifactFallback {
  attempted: boolean;
  fallback_provider?: string;
  reason?: string;
}

export interface ArtifactLineage {
  parent_artifact_id?: string;
  child_artifact_ids: string[];
  workflow_run_id?: string;
  stage?: string;
}

// ---------------------------------------------------------------------------
// Canonical Artifact Envelope
// ---------------------------------------------------------------------------

export interface ArtifactEnvelope {
  // Layer 1: Identity
  envelope_version: string;
  artifact_id: string;
  artifact_type: string;
  artifact_version: string;
  status: ArtifactStatus;
  created_at: string;

  // Layer 2: Contract
  provider: string;
  provider_family: ProviderFamily;
  output_modality: OutputModality;
  output_format: OutputFormat;

  // Layer 3: Input Summary
  input_summary: ArtifactInputSummary;

  // Layer 4: Payload
  payload: ArtifactPayload;

  // Layer 5: Provenance
  provenance: ArtifactProvenance;

  // Layer 6: Policy
  policy: ArtifactPolicy;

  // Layer 7: Limitations
  limitations: ArtifactLimitations;

  // Optional layers
  quality?: ArtifactQuality;
  confidence?: ArtifactConfidence;
  preview?: ArtifactPreview;
  execution?: ArtifactExecution;
  fallback?: ArtifactFallback;
  lineage?: ArtifactLineage;
  safety_flags?: string[];
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Zod Schemas for Runtime Validation
// ---------------------------------------------------------------------------

export const ArtifactInputSummarySchema = z.object({
  source_modality: z.string(),
  input_class: z.string(),
  input_size: z.number().int().nonnegative(),
  summary: z.string(),
});

export const ArtifactPayloadSchema = z.object({
  primary: z.unknown(),
  secondary: z.unknown().optional(),
});

export const ArtifactProvenanceSchema = z.object({
  provider_route: z.string(),
  method: z.string(),
  requested_by: z.string(),
  execution_started_at: z.string(),
  execution_completed_at: z.string(),
  normalizations: z.array(z.string()),
});

export const ArtifactPolicySchema = z.object({
  provider_eligibility: z.string(),
  local_only_requirement: z.boolean(),
  content_policy_result: z.string(),
  consent_required: z.boolean(),
  retention_policy: z.string(),
  policy_trace: z.array(z.string()),
});

export const ArtifactLimitationsSchema = z.object({
  quality_tier: z.enum(QUALITY_TIERS),
  known_constraints: z.array(z.string()),
});

export const ArtifactQualitySchema = z.object({
  score: z.number().min(0).max(1),
  dimensions: z.record(z.string(), z.number().min(0).max(1)),
  evaluator: z.string(),
});

export const ArtifactConfidenceSchema = z.object({
  overall: z.number().min(0).max(1),
  basis: z.string(),
});

export const ArtifactPreviewSchema = z.object({
  text_excerpt: z.string().optional(),
  thumbnail_uri: z.string().optional(),
});

export const ArtifactExecutionSchema = z.object({
  duration_ms: z.number().nonnegative(),
  fallback_used: z.boolean(),
  retries: z.number().int().nonnegative(),
  node: z.string().optional(),
});

export const ArtifactFallbackSchema = z.object({
  attempted: z.boolean(),
  fallback_provider: z.string().optional(),
  reason: z.string().optional(),
});

export const ArtifactLineageSchema = z.object({
  parent_artifact_id: z.string().optional(),
  child_artifact_ids: z.array(z.string()),
  workflow_run_id: z.string().optional(),
  stage: z.string().optional(),
});

export const ArtifactEnvelopeSchema = z.object({
  // Layer 1: Identity
  envelope_version: z.string(),
  artifact_id: z.string().min(1),
  artifact_type: z.string().min(1),
  artifact_version: z.string(),
  status: z.enum(ARTIFACT_STATUS),
  created_at: z.string(),

  // Layer 2: Contract
  provider: z.string(),
  provider_family: z.enum(PROVIDER_FAMILIES),
  output_modality: z.enum(OUTPUT_MODALITIES),
  output_format: z.enum(OUTPUT_FORMATS),

  // Layer 3: Input Summary
  input_summary: ArtifactInputSummarySchema,

  // Layer 4: Payload
  payload: ArtifactPayloadSchema,

  // Layer 5: Provenance
  provenance: ArtifactProvenanceSchema,

  // Layer 6: Policy
  policy: ArtifactPolicySchema,

  // Layer 7: Limitations
  limitations: ArtifactLimitationsSchema,

  // Optional layers
  quality: ArtifactQualitySchema.optional(),
  confidence: ArtifactConfidenceSchema.optional(),
  preview: ArtifactPreviewSchema.optional(),
  execution: ArtifactExecutionSchema.optional(),
  fallback: ArtifactFallbackSchema.optional(),
  lineage: ArtifactLineageSchema.optional(),
  safety_flags: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Envelope Version
// ---------------------------------------------------------------------------

export const ENVELOPE_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Factory Helpers
// ---------------------------------------------------------------------------

let artifactCounter = 0;

export function generateArtifactId(): string {
  artifactCounter++;
  const timestamp = Date.now().toString(36);
  const counter = artifactCounter.toString(36).padStart(4, '0');
  return `artf_${timestamp}_${counter}`;
}

export function createBlockedEnvelope(
  artifactType: string,
  artifactVersion: string,
  reason: string,
  policyTrace: string[],
): ArtifactEnvelope {
  const now = new Date().toISOString();
  return {
    envelope_version: ENVELOPE_VERSION,
    artifact_id: generateArtifactId(),
    artifact_type: artifactType,
    artifact_version: artifactVersion,
    status: 'blocked',
    created_at: now,
    provider: 'none',
    provider_family: 'custom',
    output_modality: 'text',
    output_format: 'plain_text',
    input_summary: {
      source_modality: 'unknown',
      input_class: 'blocked_request',
      input_size: 0,
      summary: reason,
    },
    payload: { primary: {} },
    provenance: {
      provider_route: 'none',
      method: 'none',
      requested_by: 'system',
      execution_started_at: now,
      execution_completed_at: now,
      normalizations: [],
    },
    policy: {
      provider_eligibility: 'blocked',
      local_only_requirement: false,
      content_policy_result: 'blocked',
      consent_required: false,
      retention_policy: 'none',
      policy_trace: policyTrace,
    },
    limitations: {
      quality_tier: 'none',
      known_constraints: ['artifact not produced'],
    },
  };
}

export function createFailedEnvelope(
  artifactType: string,
  artifactVersion: string,
  error: string,
  provider: string,
  providerFamily: ProviderFamily,
): ArtifactEnvelope {
  const now = new Date().toISOString();
  return {
    envelope_version: ENVELOPE_VERSION,
    artifact_id: generateArtifactId(),
    artifact_type: artifactType,
    artifact_version: artifactVersion,
    status: 'failed',
    created_at: now,
    provider,
    provider_family: providerFamily,
    output_modality: 'text',
    output_format: 'plain_text',
    input_summary: {
      source_modality: 'unknown',
      input_class: 'failed_request',
      input_size: 0,
      summary: error,
    },
    payload: { primary: {} },
    provenance: {
      provider_route: 'unknown',
      method: 'unknown',
      requested_by: 'system',
      execution_started_at: now,
      execution_completed_at: now,
      normalizations: [],
    },
    policy: {
      provider_eligibility: 'allowed',
      local_only_requirement: false,
      content_policy_result: 'not_evaluated',
      consent_required: false,
      retention_policy: 'ephemeral',
      policy_trace: [`execution failed: ${error}`],
    },
    limitations: {
      quality_tier: 'none',
      known_constraints: ['artifact not produced due to execution failure'],
    },
  };
}
