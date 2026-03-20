// Artifact Envelope
export type {
  ArtifactStatus,
  OutputModality,
  ProviderDisposition,
  QualityTier,
  ProviderFamily,
  OutputFormat,
  ArtifactInputSummary,
  ArtifactPayload,
  ArtifactProvenance,
  ArtifactPolicy,
  ArtifactLimitations,
  ArtifactQuality,
  ArtifactConfidence,
  ArtifactPreview,
  ArtifactExecution,
  ArtifactFallback,
  ArtifactLineage,
  ArtifactEnvelope,
} from './artifact-envelope.js';

export {
  ARTIFACT_STATUS,
  OUTPUT_MODALITIES,
  PROVIDER_DISPOSITIONS,
  QUALITY_TIERS,
  PROVIDER_FAMILIES,
  OUTPUT_FORMATS,
  ENVELOPE_VERSION,
  ArtifactEnvelopeSchema,
  ArtifactPayloadSchema,
  ArtifactProvenanceSchema,
  ArtifactPolicySchema,
  ArtifactLimitationsSchema,
  ArtifactQualitySchema,
  ArtifactInputSummarySchema,
  generateArtifactId,
  createBlockedEnvelope,
  createFailedEnvelope,
} from './artifact-envelope.js';

// Artifact Registry
export type { ArtifactRegistryEntry } from './artifact-registry.js';
export { ArtifactRegistry, ArtifactRegistryEntrySchema } from './artifact-registry.js';

// Disposition Matrix
export { applyDisposition, isProviderEligible, getAppleProviderId } from './disposition-matrix.js';

// Quality Model
export type { QualityDimension, QualityAssessment, QualityThresholds } from './quality-model.js';
export {
  DEFAULT_QUALITY_THRESHOLDS,
  FAMILY_QUALITY_DIMENSIONS,
  determineQualityTier,
  computeOverallScore,
  assessQuality,
  getQualityDimensionsForFamily,
} from './quality-model.js';

// Pipeline
export type { PipelineContext, PipelineStage, PipelineOptions } from './pipeline/pipeline-types.js';
export type { FamilyNormalizer } from './pipeline/family-normalizer.js';
export type { ArtifactPipelineDeps } from './pipeline/artifact-pipeline.js';
export { ArtifactPipeline } from './pipeline/artifact-pipeline.js';

// Families — Tier 1
export { TEXT_ASSIST_ENTRIES, textAssistNormalizer } from './families/text-assist.js';
export { TEXT_MODEL_ENTRIES, textModelNormalizer } from './families/text-model.js';
export { IMAGE_ENTRIES, imageNormalizer } from './families/image.js';

// Families — Tier 2
export { EXPRESSION_ENTRIES, expressionNormalizer } from './families/expression.js';
export { VISION_ENTRIES, visionNormalizer } from './families/vision.js';

// Families — Tier 3
export { ACTION_ENTRIES, actionNormalizer } from './families/action.js';

// Default Factory
export { createDefaultArtifactRegistry, createDefaultFamilyNormalizers } from './default-artifact-registry.js';
