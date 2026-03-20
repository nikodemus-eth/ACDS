import { describe, it, expect } from 'vitest';
import { SensitivityPolicyResolver } from './SensitivityPolicyResolver.js';
import { Sensitivity, TrustZone } from '@acds/core-types';

describe('SensitivityPolicyResolver', () => {
  const resolver = new SensitivityPolicyResolver();

  it('public allows all trust zones', () => {
    const result = resolver.resolve(Sensitivity.PUBLIC);
    expect(result.allowedTrustZones).toEqual([TrustZone.LOCAL, TrustZone.DEVICE, TrustZone.EXTERNAL]);
    expect(result.externalPermitted).toBe(true);
  });

  it('internal allows all trust zones', () => {
    const result = resolver.resolve(Sensitivity.INTERNAL);
    expect(result.allowedTrustZones).toEqual([TrustZone.LOCAL, TrustZone.DEVICE, TrustZone.EXTERNAL]);
    expect(result.externalPermitted).toBe(true);
  });

  it('restricted allows local and device only', () => {
    const result = resolver.resolve(Sensitivity.RESTRICTED);
    expect(result.allowedTrustZones).toEqual([TrustZone.LOCAL, TrustZone.DEVICE]);
    expect(result.externalPermitted).toBe(false);
  });

  it('confidential allows local only', () => {
    const result = resolver.resolve(Sensitivity.CONFIDENTIAL);
    expect(result.allowedTrustZones).toEqual([TrustZone.LOCAL]);
    expect(result.externalPermitted).toBe(false);
  });

  it('regulated allows local only', () => {
    const result = resolver.resolve(Sensitivity.REGULATED);
    expect(result.allowedTrustZones).toEqual([TrustZone.LOCAL]);
    expect(result.externalPermitted).toBe(false);
  });
});
