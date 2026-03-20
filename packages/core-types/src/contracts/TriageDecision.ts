import type { TrustZone } from '../enums/TrustZone.js';

export interface CandidateEvaluation {
  providerId: string;
  modelProfileId: string;
  eligible: boolean;
  rejectionReason: string | null;
}

export interface TriageDecision {
  triageId: string;
  intentId: string;
  classification: {
    taskClass: string;
    modality: string;
    sensitivity: string;
    qualityTier: string;
  };
  policyEvaluation: {
    appliedRules: string[];
    allowedTrustZones: TrustZone[];
    externalPermitted: boolean;
  };
  candidateProviders: CandidateEvaluation[];
  selectedProvider: {
    providerId: string;
    modelProfileId: string;
    selectionReason: string;
  } | null;
  fallbackChain: string[];
  timestamp: string;
}

export type TriageErrorCode =
  | 'NO_ELIGIBLE_PROVIDER'
  | 'POLICY_CONFLICT'
  | 'INVALID_INTENT_ENVELOPE';

export interface TriageError {
  error: TriageErrorCode;
  reason: string;
  details?: string[];
}
