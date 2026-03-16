// ---------------------------------------------------------------------------
// Chaos Tests — Adaptive State Loss
// ---------------------------------------------------------------------------
// Simulates the optimizer's persisted state disappearing mid-operation.
// The system must degrade gracefully rather than crash.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Types mirroring the adaptive-optimizer domain
// ---------------------------------------------------------------------------

interface FamilySelectionState {
  familyKey: string;
  currentProfileId: string;
  recentScores: number[];
}

interface CandidatePerformanceState {
  candidateId: string;
  weightedScore: number;
  executionCount: number;
}

interface OptimizerStateRepository {
  getFamilyState(familyKey: string): FamilySelectionState | null;
  getCandidates(familyKey: string): CandidatePerformanceState[];
  saveFamilyState(state: FamilySelectionState): void;
}

interface AdaptiveSelectionResult {
  selectedProfileId: string;
  degraded: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Mock repository that can simulate state loss
// ---------------------------------------------------------------------------

function createStateLossRepository(
  initialState: Map<string, FamilySelectionState>,
  initialCandidates: Map<string, CandidatePerformanceState[]>,
  options: { loseFamilyState: boolean; loseCandidates: boolean },
): OptimizerStateRepository {
  return {
    getFamilyState(familyKey: string): FamilySelectionState | null {
      if (options.loseFamilyState) return null;
      return initialState.get(familyKey) ?? null;
    },
    getCandidates(familyKey: string): CandidatePerformanceState[] {
      if (options.loseCandidates) return [];
      return initialCandidates.get(familyKey) ?? [];
    },
    saveFamilyState(_state: FamilySelectionState): void {
      // no-op in test
    },
  };
}

// ---------------------------------------------------------------------------
// Selection logic that handles missing state
// ---------------------------------------------------------------------------

function selectWithDegradation(
  repo: OptimizerStateRepository,
  familyKey: string,
  defaultProfileId: string,
): AdaptiveSelectionResult {
  const familyState = repo.getFamilyState(familyKey);

  if (!familyState) {
    // Family state is gone — fall back to default and rebuild
    repo.saveFamilyState({
      familyKey,
      currentProfileId: defaultProfileId,
      recentScores: [],
    });

    return {
      selectedProfileId: defaultProfileId,
      degraded: true,
      reason: 'family state missing — reset to default profile',
    };
  }

  const candidates = repo.getCandidates(familyKey);

  if (candidates.length === 0) {
    // Candidate data is gone — keep current selection, flag degradation
    return {
      selectedProfileId: familyState.currentProfileId,
      degraded: true,
      reason: 'candidate performance data missing — retaining current selection',
    };
  }

  // Normal path: select the top candidate
  const sorted = [...candidates].sort((a, b) => b.weightedScore - a.weightedScore);
  const topCandidate = sorted[0];

  return {
    selectedProfileId: topCandidate.candidateId,
    degraded: false,
    reason: `selected top candidate: ${topCandidate.candidateId} (score: ${topCandidate.weightedScore})`,
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FAMILY_KEY = 'thingstead.ingestion.classify';
const DEFAULT_PROFILE = 'local_fast_advisory';

function seedState(): {
  familyStates: Map<string, FamilySelectionState>;
  candidates: Map<string, CandidatePerformanceState[]>;
} {
  const familyStates = new Map<string, FamilySelectionState>();
  familyStates.set(FAMILY_KEY, {
    familyKey: FAMILY_KEY,
    currentProfileId: 'local_balanced_reasoning',
    recentScores: [0.82, 0.85, 0.84, 0.86],
  });

  const candidates = new Map<string, CandidatePerformanceState[]>();
  candidates.set(FAMILY_KEY, [
    { candidateId: 'local_balanced_reasoning', weightedScore: 0.84, executionCount: 50 },
    { candidateId: 'local_fast_advisory', weightedScore: 0.78, executionCount: 30 },
    { candidateId: 'local_strict_classifier', weightedScore: 0.88, executionCount: 20 },
  ]);

  return { familyStates, candidates };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Adaptive State Loss — Family state disappears', () => {
  it('falls back to the default profile', () => {
    const { familyStates, candidates } = seedState();
    const repo = createStateLossRepository(familyStates, candidates, {
      loseFamilyState: true,
      loseCandidates: false,
    });

    const result = selectWithDegradation(repo, FAMILY_KEY, DEFAULT_PROFILE);

    expect(result.selectedProfileId).toBe(DEFAULT_PROFILE);
    expect(result.degraded).toBe(true);
    expect(result.reason).toContain('family state missing');
  });

  it('flags the result as degraded', () => {
    const { familyStates, candidates } = seedState();
    const repo = createStateLossRepository(familyStates, candidates, {
      loseFamilyState: true,
      loseCandidates: false,
    });

    const result = selectWithDegradation(repo, FAMILY_KEY, DEFAULT_PROFILE);

    expect(result.degraded).toBe(true);
  });
});

describe('Adaptive State Loss — Candidate data disappears', () => {
  it('retains the current selection from family state', () => {
    const { familyStates, candidates } = seedState();
    const repo = createStateLossRepository(familyStates, candidates, {
      loseFamilyState: false,
      loseCandidates: true,
    });

    const result = selectWithDegradation(repo, FAMILY_KEY, DEFAULT_PROFILE);

    expect(result.selectedProfileId).toBe('local_balanced_reasoning');
    expect(result.degraded).toBe(true);
    expect(result.reason).toContain('candidate performance data missing');
  });
});

describe('Adaptive State Loss — Both family and candidate state disappear', () => {
  it('falls back to default without crashing', () => {
    const { familyStates, candidates } = seedState();
    const repo = createStateLossRepository(familyStates, candidates, {
      loseFamilyState: true,
      loseCandidates: true,
    });

    const result = selectWithDegradation(repo, FAMILY_KEY, DEFAULT_PROFILE);

    expect(result.selectedProfileId).toBe(DEFAULT_PROFILE);
    expect(result.degraded).toBe(true);
  });
});

describe('Adaptive State Loss — Normal operation (no loss)', () => {
  it('selects the top candidate when state is intact', () => {
    const { familyStates, candidates } = seedState();
    const repo = createStateLossRepository(familyStates, candidates, {
      loseFamilyState: false,
      loseCandidates: false,
    });

    const result = selectWithDegradation(repo, FAMILY_KEY, DEFAULT_PROFILE);

    expect(result.selectedProfileId).toBe('local_strict_classifier');
    expect(result.degraded).toBe(false);
    expect(result.reason).toContain('0.88');
  });

  it('handles a family key that was never populated', () => {
    const { familyStates, candidates } = seedState();
    const repo = createStateLossRepository(familyStates, candidates, {
      loseFamilyState: false,
      loseCandidates: false,
    });

    const result = selectWithDegradation(repo, 'unknown.family.key', DEFAULT_PROFILE);

    expect(result.selectedProfileId).toBe(DEFAULT_PROFILE);
    expect(result.degraded).toBe(true);
    expect(result.reason).toContain('family state missing');
  });
});
