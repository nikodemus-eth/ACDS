import type { ApplicationPolicy, GlobalPolicy, ProcessPolicy } from '@acds/policy-engine';

export interface PolicyPayloadView {
  id?: string;
  level: 'global' | 'application' | 'process';
  application?: string;
  process?: string;
  allowedVendors?: string[];
  blockedVendors?: string[];
  defaults?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  enabled?: boolean;
}

export class PolicyPresenter {
  static fromGlobal(policy: GlobalPolicy) {
    return {
      id: policy.id,
      level: 'global' as const,
      allowedVendors: policy.allowedVendors,
      blockedVendors: policy.blockedVendors,
      defaults: {
        privacy: policy.defaultPrivacy,
        costSensitivity: policy.defaultCostSensitivity,
        localPreferredTaskTypes: policy.localPreferredTaskTypes,
      },
      constraints: {
        structuredOutputRequiredForGrades: policy.structuredOutputRequiredForGrades,
        traceabilityRequiredForGrades: policy.traceabilityRequiredForGrades,
        maxLatencyMsByLoadTier: policy.maxLatencyMsByLoadTier,
        cloudRequiredLoadTiers: policy.cloudRequiredLoadTiers,
      },
      enabled: policy.enabled,
      createdAt: policy.updatedAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  static fromApplication(policy: ApplicationPolicy) {
    return {
      id: policy.id,
      level: 'application' as const,
      application: policy.application,
      allowedVendors: policy.allowedVendors ?? [],
      blockedVendors: policy.blockedVendors ?? [],
      defaults: {
        privacyOverride: policy.privacyOverride,
        costSensitivityOverride: policy.costSensitivityOverride,
        preferredModelProfileIds: policy.preferredModelProfileIds,
        localPreferredTaskTypes: policy.localPreferredTaskTypes,
      },
      constraints: {
        blockedModelProfileIds: policy.blockedModelProfileIds,
        structuredOutputRequiredForGrades: policy.structuredOutputRequiredForGrades,
      },
      enabled: policy.enabled,
      createdAt: policy.updatedAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  static fromProcess(policy: ProcessPolicy) {
    return {
      id: policy.id,
      level: 'process' as const,
      application: policy.application,
      process: policy.process,
      allowedVendors: [],
      blockedVendors: [],
      defaults: {
        defaultModelProfileId: policy.defaultModelProfileId,
        defaultTacticProfileId: policy.defaultTacticProfileId,
        privacyOverride: policy.privacyOverride,
        costSensitivityOverride: policy.costSensitivityOverride,
      },
      constraints: {
        step: policy.step,
        allowedModelProfileIds: policy.allowedModelProfileIds,
        blockedModelProfileIds: policy.blockedModelProfileIds,
        allowedTacticProfileIds: policy.allowedTacticProfileIds,
        forceEscalationForGrades: policy.forceEscalationForGrades,
      },
      enabled: policy.enabled,
      createdAt: policy.updatedAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }
}
