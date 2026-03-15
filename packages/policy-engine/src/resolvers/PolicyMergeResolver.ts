import type { GlobalPolicy } from '../global/GlobalPolicy.js';
import type { ApplicationPolicy } from '../application/ApplicationPolicy.js';
import type { ProcessPolicy } from '../process/ProcessPolicy.js';
import type { InstancePolicyOverrides } from '../instance/InstancePolicyOverlay.js';
import type { ProviderVendor, CognitiveGrade, LoadTier } from '@acds/core-types';

export interface EffectivePolicy {
  allowedVendors: ProviderVendor[];
  blockedVendors: ProviderVendor[];
  privacy: 'local_only' | 'cloud_allowed' | 'cloud_preferred';
  costSensitivity: 'low' | 'medium' | 'high';
  structuredOutputRequired: boolean;
  traceabilityRequired: boolean;
  maxLatencyMs: number | null;
  allowedModelProfileIds: string[] | null;
  blockedModelProfileIds: string[];
  allowedTacticProfileIds: string[] | null;
  defaultModelProfileId: string | null;
  defaultTacticProfileId: string | null;
  forceEscalation: boolean;
}

export class PolicyMergeResolver {
  merge(
    global: GlobalPolicy,
    application: ApplicationPolicy | null,
    process: ProcessPolicy | null,
    instanceOverrides: InstancePolicyOverrides,
    cognitiveGrade: CognitiveGrade,
    loadTier: LoadTier
  ): EffectivePolicy {
    const blockedVendors = [
      ...global.blockedVendors,
      ...(application?.blockedVendors ?? []),
    ];

    const allowedVendors = (application?.allowedVendors ?? global.allowedVendors)
      .filter((v) => !blockedVendors.includes(v));

    const privacy = instanceOverrides.forceLocalOnly
      ? 'local_only' as const
      : (process?.privacyOverride ?? application?.privacyOverride ?? global.defaultPrivacy);

    const costSensitivity = instanceOverrides.boostCostSensitivity
      ? 'high' as const
      : (process?.costSensitivityOverride ?? application?.costSensitivityOverride ?? global.defaultCostSensitivity);

    const structuredOutputRequired = global.structuredOutputRequiredForGrades.includes(cognitiveGrade)
      || (application?.structuredOutputRequiredForGrades?.includes(cognitiveGrade) ?? false);

    const traceabilityRequired = global.traceabilityRequiredForGrades.includes(cognitiveGrade);

    const maxLatencyMs = global.maxLatencyMsByLoadTier[loadTier] ?? null;

    const blockedModelProfileIds = [
      ...(application?.blockedModelProfileIds ?? []),
      ...(process?.blockedModelProfileIds ?? []),
    ];

    const forceEscalation = instanceOverrides.forceEscalation
      || (process?.forceEscalationForGrades?.includes(cognitiveGrade) ?? false);

    return {
      allowedVendors,
      blockedVendors,
      privacy,
      costSensitivity,
      structuredOutputRequired,
      traceabilityRequired,
      maxLatencyMs,
      allowedModelProfileIds: process?.allowedModelProfileIds ?? null,
      blockedModelProfileIds,
      allowedTacticProfileIds: process?.allowedTacticProfileIds ?? null,
      defaultModelProfileId: process?.defaultModelProfileId ?? null,
      defaultTacticProfileId: process?.defaultTacticProfileId ?? null,
      forceEscalation,
    };
  }
}
