import type { NormalizedInstanceContext } from './InstanceContextNormalizer.js';

export interface InstancePolicyOverrides {
  forceEscalation: boolean;
  forceLocalOnly: boolean;
  boostCostSensitivity: boolean;
}

export function computeInstanceOverrides(context: NormalizedInstanceContext): InstancePolicyOverrides {
  return {
    forceEscalation: context.retryCount > 2 || context.previousFailures.length > 1,
    forceLocalOnly: false,
    boostCostSensitivity: context.deadlinePressure,
  };
}
