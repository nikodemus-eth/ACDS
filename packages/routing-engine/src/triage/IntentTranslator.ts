import type { IntentEnvelope, RoutingRequest, RoutingConstraints } from '@acds/core-types';
import { LoadTier, DecisionPosture, CognitiveGrade, QualityTier, Sensitivity } from '@acds/core-types';

const QUALITY_TO_COGNITIVE: Record<string, CognitiveGrade> = {
  [QualityTier.LOW]: CognitiveGrade.BASIC,
  [QualityTier.MEDIUM]: CognitiveGrade.STANDARD,
  [QualityTier.HIGH]: CognitiveGrade.ENHANCED,
  [QualityTier.CRITICAL]: CognitiveGrade.FRONTIER,
};

const SENSITIVITY_TO_PRIVACY: Record<string, RoutingConstraints['privacy']> = {
  [Sensitivity.PUBLIC]: 'cloud_allowed',
  [Sensitivity.INTERNAL]: 'cloud_allowed',
  [Sensitivity.RESTRICTED]: 'local_only',
  [Sensitivity.CONFIDENTIAL]: 'local_only',
  [Sensitivity.REGULATED]: 'local_only',
};

export class IntentTranslator {
  translate(envelope: IntentEnvelope): RoutingRequest {
    const privacy = this.resolvePrivacy(envelope);
    const cognitiveGrade = QUALITY_TO_COGNITIVE[envelope.qualityTier] ?? CognitiveGrade.STANDARD;

    const constraints: RoutingConstraints = {
      privacy,
      maxLatencyMs: envelope.latencyTargetMs,
      costSensitivity: envelope.costSensitivity,
      structuredOutputRequired: envelope.requiresSchemaValidation,
      traceabilityRequired: false,
    };

    return {
      application: envelope.origin,
      process: 'triage',
      step: envelope.intentId,
      taskType: envelope.taskClass,
      loadTier: LoadTier.SINGLE_SHOT,
      decisionPosture: DecisionPosture.OPERATIONAL,
      cognitiveGrade,
      input: '',
      constraints,
    };
  }

  private resolvePrivacy(envelope: IntentEnvelope): RoutingConstraints['privacy'] {
    if (envelope.executionConstraints.localOnly) return 'local_only';
    if (envelope.executionConstraints.externalAllowed) return 'cloud_allowed';
    return SENSITIVITY_TO_PRIVACY[envelope.sensitivity] ?? 'local_only';
  }
}
