import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyConflictDetector } from './PolicyConflictDetector.js';
import type { GlobalPolicy } from '../global/GlobalPolicy.js';
import type { ApplicationPolicy } from '../application/ApplicationPolicy.js';

function makeGlobalPolicy(overrides: Partial<GlobalPolicy> = {}): GlobalPolicy {
  return {
    id: 'g1',
    allowedVendors: ['openai' as any, 'gemini' as any],
    blockedVendors: [],
    defaultPrivacy: 'cloud_allowed',
    defaultCostSensitivity: 'medium',
    structuredOutputRequiredForGrades: [],
    traceabilityRequiredForGrades: [],
    maxLatencyMsByLoadTier: {},
    localPreferredTaskTypes: [],
    cloudRequiredLoadTiers: [],
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAppPolicy(overrides: Partial<ApplicationPolicy> = {}): ApplicationPolicy {
  return {
    id: 'a1',
    application: 'test-app',
    allowedVendors: null,
    blockedVendors: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    preferredModelProfileIds: null,
    blockedModelProfileIds: null,
    localPreferredTaskTypes: null,
    structuredOutputRequiredForGrades: null,
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PolicyConflictDetector', () => {
  let detector: PolicyConflictDetector;

  beforeEach(() => {
    detector = new PolicyConflictDetector();
  });

  it('returns no conflicts when application has no allowedVendors and no privacy override', () => {
    const conflicts = detector.detect(makeGlobalPolicy(), makeAppPolicy());
    expect(conflicts).toEqual([]);
  });

  it('returns no conflicts when application vendors are not blocked globally', () => {
    const conflicts = detector.detect(
      makeGlobalPolicy({ blockedVendors: ['ollama' as any] }),
      makeAppPolicy({ allowedVendors: ['openai' as any] }),
    );
    expect(conflicts).toEqual([]);
  });

  it('returns error conflict when application allows vendors blocked by global policy', () => {
    const conflicts = detector.detect(
      makeGlobalPolicy({ blockedVendors: ['openai' as any, 'gemini' as any] }),
      makeAppPolicy({ allowedVendors: ['openai' as any, 'lmstudio' as any] }),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('error');
    expect(conflicts[0].field).toBe('allowedVendors');
    expect(conflicts[0].message).toContain('openai');
    expect(conflicts[0].message).not.toContain('lmstudio');
  });

  it('returns error listing multiple blocked vendors', () => {
    const conflicts = detector.detect(
      makeGlobalPolicy({ blockedVendors: ['openai' as any, 'gemini' as any] }),
      makeAppPolicy({ allowedVendors: ['openai' as any, 'gemini' as any] }),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].message).toContain('openai');
    expect(conflicts[0].message).toContain('gemini');
  });

  it('returns warning when app prefers cloud but global defaults to local_only', () => {
    const conflicts = detector.detect(
      makeGlobalPolicy({ defaultPrivacy: 'local_only' }),
      makeAppPolicy({ privacyOverride: 'cloud_preferred' }),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('warning');
    expect(conflicts[0].field).toBe('privacy');
  });

  it('returns no privacy conflict when global is cloud_allowed and app is cloud_preferred', () => {
    const conflicts = detector.detect(
      makeGlobalPolicy({ defaultPrivacy: 'cloud_allowed' }),
      makeAppPolicy({ privacyOverride: 'cloud_preferred' }),
    );
    expect(conflicts).toEqual([]);
  });

  it('returns no privacy conflict when app privacy is local_only', () => {
    const conflicts = detector.detect(
      makeGlobalPolicy({ defaultPrivacy: 'local_only' }),
      makeAppPolicy({ privacyOverride: 'local_only' }),
    );
    expect(conflicts).toEqual([]);
  });

  it('returns no privacy conflict when app privacy is null', () => {
    const conflicts = detector.detect(
      makeGlobalPolicy({ defaultPrivacy: 'local_only' }),
      makeAppPolicy({ privacyOverride: null }),
    );
    expect(conflicts).toEqual([]);
  });

  it('returns both vendor and privacy conflicts when both apply', () => {
    const conflicts = detector.detect(
      makeGlobalPolicy({ blockedVendors: ['openai' as any], defaultPrivacy: 'local_only' }),
      makeAppPolicy({ allowedVendors: ['openai' as any], privacyOverride: 'cloud_preferred' }),
    );
    expect(conflicts).toHaveLength(2);
    const severities = conflicts.map((c) => c.severity);
    expect(severities).toContain('error');
    expect(severities).toContain('warning');
  });

  it('returns no vendor conflict when application allowedVendors is empty array', () => {
    const conflicts = detector.detect(
      makeGlobalPolicy({ blockedVendors: ['openai' as any] }),
      makeAppPolicy({ allowedVendors: [] }),
    );
    // filter returns empty, so no unauthorized vendors
    expect(conflicts).toEqual([]);
  });
});
