// LFSI MVP — Policy Resolution
// Spec reference: Section 6 (Policy Scope)

import type { LfsiPolicy, LfsiTier } from './types.js';
import { LfsiError, LFSI_REASON } from './errors.js';

export interface PolicyResolution {
  readonly allowedTiers: readonly LfsiTier[];
  readonly allowEscalation: boolean;
  readonly deniedCapabilities: readonly string[];
}

const POLICIES: Record<LfsiPolicy, PolicyResolution> = {
  'lfsi.local_balanced': {
    allowedTiers: ['tier0', 'tier1'],
    allowEscalation: true,
    deniedCapabilities: [],
  },
  'lfsi.apple_only': {
    allowedTiers: ['tier0'],
    allowEscalation: false,
    deniedCapabilities: [],
  },
  'lfsi.private_strict': {
    allowedTiers: ['tier0', 'tier1'],
    allowEscalation: true,
    deniedCapabilities: ['research.web'],
  },
};

export function resolvePolicy(policyName: LfsiPolicy, capability: string): PolicyResolution {
  const policy = POLICIES[policyName];
  if (!policy) {
    throw new LfsiError(LFSI_REASON.UNKNOWN_CAPABILITY, `Unknown policy: ${policyName}`);
  }

  if (policy.deniedCapabilities.includes(capability)) {
    if (capability === 'research.web') {
      throw new LfsiError(
        LFSI_REASON.WEB_RESEARCH_NOT_ALLOWED_UNDER_PRIVATE_STRICT,
        `Capability '${capability}' is denied under policy '${policyName}'`,
      );
    }
    throw new LfsiError(
      LFSI_REASON.CURRENT_WEB_FORBIDDEN_UNDER_PRIVATE_STRICT,
      `Capability '${capability}' requires current web access, denied under '${policyName}'`,
    );
  }

  return policy;
}
