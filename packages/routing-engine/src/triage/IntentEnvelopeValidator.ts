import type { IntentEnvelope, TriageError } from '@acds/core-types';
import { TaskType } from '@acds/core-types';
import { Modality, Sensitivity, QualityTier, ContextSize } from '@acds/core-types';

export type IntentValidationResult =
  | { valid: true }
  | { valid: false; error: TriageError };

export class IntentEnvelopeValidator {
  validate(envelope: IntentEnvelope): IntentValidationResult {
    const missing: string[] = [];

    if (!envelope.intentId) missing.push('intentId');
    if (!envelope.taskClass) missing.push('taskClass');
    if (!envelope.modality) missing.push('modality');
    if (!envelope.sensitivity) missing.push('sensitivity');
    if (!envelope.qualityTier) missing.push('qualityTier');
    if (!envelope.timestamp) missing.push('timestamp');
    if (!envelope.origin) missing.push('origin');
    if (!envelope.executionConstraints) missing.push('executionConstraints');

    if (missing.length > 0) {
      return {
        valid: false,
        error: {
          error: 'INVALID_INTENT_ENVELOPE',
          reason: `Missing required fields: ${missing.join(', ')}`,
          details: missing,
        },
      };
    }

    const invalid: string[] = [];

    if (!Object.values(TaskType).includes(envelope.taskClass)) {
      invalid.push(`taskClass: unknown value '${envelope.taskClass}'`);
    }
    if (!Object.values(Modality).includes(envelope.modality)) {
      invalid.push(`modality: unknown value '${envelope.modality}'`);
    }
    if (!Object.values(Sensitivity).includes(envelope.sensitivity)) {
      invalid.push(`sensitivity: unknown value '${envelope.sensitivity}'`);
    }
    if (!Object.values(QualityTier).includes(envelope.qualityTier)) {
      invalid.push(`qualityTier: unknown value '${envelope.qualityTier}'`);
    }
    if (!Object.values(ContextSize).includes(envelope.contextSizeEstimate)) {
      invalid.push(`contextSizeEstimate: unknown value '${envelope.contextSizeEstimate}'`);
    }
    if (!['low', 'medium', 'high'].includes(envelope.costSensitivity)) {
      invalid.push(`costSensitivity: must be low|medium|high, got '${envelope.costSensitivity}'`);
    }
    if (!['process_swarm', 'manual', 'api'].includes(envelope.origin)) {
      invalid.push(`origin: must be process_swarm|manual|api, got '${envelope.origin}'`);
    }

    if (envelope.executionConstraints) {
      const ec = envelope.executionConstraints;
      if (ec.localOnly && ec.externalAllowed) {
        invalid.push('executionConstraints: localOnly and externalAllowed are mutually exclusive');
      }
    }

    if (invalid.length > 0) {
      return {
        valid: false,
        error: {
          error: 'INVALID_INTENT_ENVELOPE',
          reason: `Invalid field values: ${invalid.join('; ')}`,
          details: invalid,
        },
      };
    }

    return { valid: true };
  }
}
