import { Sensitivity, TrustZone } from '@acds/core-types';

const SENSITIVITY_TRUST_MAP: Record<Sensitivity, TrustZone[]> = {
  [Sensitivity.PUBLIC]: [TrustZone.LOCAL, TrustZone.DEVICE, TrustZone.EXTERNAL],
  [Sensitivity.INTERNAL]: [TrustZone.LOCAL, TrustZone.DEVICE, TrustZone.EXTERNAL],
  [Sensitivity.RESTRICTED]: [TrustZone.LOCAL, TrustZone.DEVICE],
  [Sensitivity.CONFIDENTIAL]: [TrustZone.LOCAL],
  [Sensitivity.REGULATED]: [TrustZone.LOCAL],
};

export interface SensitivityPolicyResult {
  allowedTrustZones: TrustZone[];
  externalPermitted: boolean;
}

export class SensitivityPolicyResolver {
  resolve(sensitivity: Sensitivity): SensitivityPolicyResult {
    const allowedTrustZones = SENSITIVITY_TRUST_MAP[sensitivity];
    const externalPermitted = allowedTrustZones.includes(TrustZone.EXTERNAL);

    return { allowedTrustZones, externalPermitted };
  }
}
