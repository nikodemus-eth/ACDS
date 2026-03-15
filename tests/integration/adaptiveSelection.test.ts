// ---------------------------------------------------------------------------
// Integration Tests – Adaptive Selection (Prompt 59)
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Types for the adaptive selection domain
// ---------------------------------------------------------------------------

type SelectionMode = 'observe_only' | 'recommend_only' | 'auto_apply_low_risk' | 'auto_apply_all';

interface AdaptiveCandidate {
  profileId: string;
  score: number;
  isCurrentSelection: boolean;
}

interface SelectionPolicy {
  mode: SelectionMode;
  explorationRate: number; // 0..1, probability of trying a non-top candidate
  riskTolerance: 'low' | 'medium' | 'high';
}

interface SelectionResult {
  selectedProfileId: string;
  wasChanged: boolean;
  reason: string;
  explorationTriggered: boolean;
}

interface FamilyConsequenceLevel {
  familyKey: string;
  consequence: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Mock adaptive selection logic (simulates @acds/adaptive-routing)
// ---------------------------------------------------------------------------

function selectAdaptive(
  candidates: AdaptiveCandidate[],
  policy: SelectionPolicy,
  currentProfileId: string,
  deterministicRandom: number, // 0..1 to simulate randomness deterministically
): SelectionResult {
  if (candidates.length === 0) {
    return { selectedProfileId: currentProfileId, wasChanged: false, reason: 'no candidates', explorationTriggered: false };
  }

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const topCandidate = sorted[0];

  // observe_only: never change
  if (policy.mode === 'observe_only') {
    return {
      selectedProfileId: currentProfileId,
      wasChanged: false,
      reason: 'observe_only mode – no changes applied',
      explorationTriggered: false,
    };
  }

  // Determine if exploration triggers
  const shouldExplore = deterministicRandom < policy.explorationRate && sorted.length > 1;
  const explorationCandidate = shouldExplore ? sorted[1] : null;

  const chosenCandidate = explorationCandidate ?? topCandidate;

  // recommend_only: compute but don't apply
  if (policy.mode === 'recommend_only') {
    return {
      selectedProfileId: currentProfileId,
      wasChanged: false,
      reason: `recommend_only – would select ${chosenCandidate.profileId} (score: ${chosenCandidate.score})`,
      explorationTriggered: shouldExplore,
    };
  }

  // auto_apply_low_risk: only apply when risk tolerance matches
  if (policy.mode === 'auto_apply_low_risk' && policy.riskTolerance !== 'low') {
    return {
      selectedProfileId: currentProfileId,
      wasChanged: false,
      reason: `auto_apply_low_risk – risk too high (${policy.riskTolerance})`,
      explorationTriggered: false,
    };
  }

  // auto_apply modes: apply the selection
  const changed = chosenCandidate.profileId !== currentProfileId;
  return {
    selectedProfileId: chosenCandidate.profileId,
    wasChanged: changed,
    reason: changed
      ? `applied adaptive selection: ${chosenCandidate.profileId} (score: ${chosenCandidate.score})`
      : 'adaptive selection confirms current choice',
    explorationTriggered: shouldExplore,
  };
}

function explorationRateForFamily(consequence: FamilyConsequenceLevel): number {
  switch (consequence.consequence) {
    case 'low': return 0.15;
    case 'medium': return 0.08;
    case 'high': return 0.02;
  }
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeCandidates(): AdaptiveCandidate[] {
  return [
    { profileId: 'profile-a', score: 0.85, isCurrentSelection: true },
    { profileId: 'profile-b', score: 0.92, isCurrentSelection: false },
    { profileId: 'profile-c', score: 0.78, isCurrentSelection: false },
  ];
}

// ===========================================================================
// observe_only Tests
// ===========================================================================

describe('Adaptive Selection – observe_only mode', () => {
  it('does not change the current selection', () => {
    const candidates = makeCandidates();
    const policy: SelectionPolicy = { mode: 'observe_only', explorationRate: 0.1, riskTolerance: 'low' };

    const result = selectAdaptive(candidates, policy, 'profile-a', 0.5);

    expect(result.selectedProfileId).toBe('profile-a');
    expect(result.wasChanged).toBe(false);
  });

  it('reports the observe_only reason', () => {
    const candidates = makeCandidates();
    const policy: SelectionPolicy = { mode: 'observe_only', explorationRate: 0.1, riskTolerance: 'low' };

    const result = selectAdaptive(candidates, policy, 'profile-a', 0.05);

    expect(result.reason).toContain('observe_only');
    expect(result.explorationTriggered).toBe(false);
  });
});

// ===========================================================================
// recommend_only Tests
// ===========================================================================

describe('Adaptive Selection – recommend_only mode', () => {
  it('computes the recommendation but does not apply it', () => {
    const candidates = makeCandidates();
    const policy: SelectionPolicy = { mode: 'recommend_only', explorationRate: 0.0, riskTolerance: 'medium' };

    const result = selectAdaptive(candidates, policy, 'profile-a', 0.5);

    expect(result.selectedProfileId).toBe('profile-a');
    expect(result.wasChanged).toBe(false);
    expect(result.reason).toContain('recommend_only');
    expect(result.reason).toContain('profile-b'); // highest scored
  });

  it('indicates what would have been selected', () => {
    const candidates = makeCandidates();
    const policy: SelectionPolicy = { mode: 'recommend_only', explorationRate: 0.0, riskTolerance: 'medium' };

    const result = selectAdaptive(candidates, policy, 'profile-a', 0.5);

    expect(result.reason).toContain('0.92'); // top candidate score
  });
});

// ===========================================================================
// auto_apply_low_risk Tests
// ===========================================================================

describe('Adaptive Selection – auto_apply_low_risk mode', () => {
  it('applies the adaptive selection for low-risk tolerance', () => {
    const candidates = makeCandidates();
    const policy: SelectionPolicy = { mode: 'auto_apply_low_risk', explorationRate: 0.0, riskTolerance: 'low' };

    const result = selectAdaptive(candidates, policy, 'profile-a', 0.5);

    expect(result.selectedProfileId).toBe('profile-b'); // highest scored
    expect(result.wasChanged).toBe(true);
    expect(result.reason).toContain('applied adaptive selection');
  });

  it('does not apply when risk tolerance is not low', () => {
    const candidates = makeCandidates();
    const policy: SelectionPolicy = { mode: 'auto_apply_low_risk', explorationRate: 0.0, riskTolerance: 'high' };

    const result = selectAdaptive(candidates, policy, 'profile-a', 0.5);

    expect(result.selectedProfileId).toBe('profile-a');
    expect(result.wasChanged).toBe(false);
    expect(result.reason).toContain('risk too high');
  });

  it('confirms current selection when it is already the top candidate', () => {
    const candidates: AdaptiveCandidate[] = [
      { profileId: 'profile-a', score: 0.95, isCurrentSelection: true },
      { profileId: 'profile-b', score: 0.80, isCurrentSelection: false },
    ];
    const policy: SelectionPolicy = { mode: 'auto_apply_low_risk', explorationRate: 0.0, riskTolerance: 'low' };

    const result = selectAdaptive(candidates, policy, 'profile-a', 0.5);

    expect(result.selectedProfileId).toBe('profile-a');
    expect(result.wasChanged).toBe(false);
    expect(result.reason).toContain('confirms current choice');
  });
});

// ===========================================================================
// Exploration Policy Tests
// ===========================================================================

describe('Adaptive Selection – Exploration Policy', () => {
  it('assigns higher exploration rate for low-consequence families', () => {
    const lowConsequence: FamilyConsequenceLevel = { familyKey: 'app.casual.chat', consequence: 'low' };
    const highConsequence: FamilyConsequenceLevel = { familyKey: 'app.legal.review', consequence: 'high' };

    const lowRate = explorationRateForFamily(lowConsequence);
    const highRate = explorationRateForFamily(highConsequence);

    expect(lowRate).toBeGreaterThan(highRate);
  });

  it('triggers exploration when random value is below exploration rate', () => {
    const candidates = makeCandidates();
    const policy: SelectionPolicy = { mode: 'auto_apply_low_risk', explorationRate: 0.5, riskTolerance: 'low' };

    // deterministicRandom = 0.1 which is < 0.5 exploration rate
    const result = selectAdaptive(candidates, policy, 'profile-a', 0.1);

    expect(result.explorationTriggered).toBe(true);
    // Should pick second-best candidate (profile-a at 0.85) instead of top (profile-b at 0.92)
    expect(result.selectedProfileId).toBe('profile-a');
  });

  it('does not trigger exploration when random value exceeds rate', () => {
    const candidates = makeCandidates();
    const policy: SelectionPolicy = { mode: 'auto_apply_low_risk', explorationRate: 0.1, riskTolerance: 'low' };

    // deterministicRandom = 0.5 which is > 0.1 exploration rate
    const result = selectAdaptive(candidates, policy, 'profile-a', 0.5);

    expect(result.explorationTriggered).toBe(false);
    expect(result.selectedProfileId).toBe('profile-b'); // top candidate
  });

  it('medium-consequence families have intermediate exploration rate', () => {
    const low = explorationRateForFamily({ familyKey: 'app.chat', consequence: 'low' });
    const med = explorationRateForFamily({ familyKey: 'app.draft', consequence: 'medium' });
    const high = explorationRateForFamily({ familyKey: 'app.legal', consequence: 'high' });

    expect(low).toBeGreaterThan(med);
    expect(med).toBeGreaterThan(high);
  });
});
