// ---------------------------------------------------------------------------
// Integration Tests – Adaptation Rollback (Prompt 68)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  AdaptationRollbackService,
  type RollbackAuditEvent,
  type RollbackAuditEmitter,
  type RollbackRecordWriter,
} from '@acds/adaptive-optimizer';
import type {
  AdaptationEvent,
  AdaptationLedgerWriter,
  AdaptationEventFilters,
  OptimizerStateRepository,
  FamilySelectionState,
  CandidatePerformanceState,
  AdaptationRollbackRecord,
  RankedCandidate,
} from '@acds/adaptive-optimizer';

// ── In-memory ledger ──────────────────────────────────────────────────────

class InMemoryLedger implements AdaptationLedgerWriter {
  private events = new Map<string, AdaptationEvent>();

  addEvent(event: AdaptationEvent) {
    this.events.set(event.id, event);
  }

  async writeEvent(event: AdaptationEvent): Promise<void> {
    this.events.set(event.id, event);
  }

  async getEvent(id: string): Promise<AdaptationEvent | undefined> {
    return this.events.get(id);
  }

  async listEvents(_familyKey: string, _filters?: AdaptationEventFilters): Promise<AdaptationEvent[]> {
    return [...this.events.values()];
  }
}

// ── In-memory optimizer state ─────────────────────────────────────────────

class InMemoryOptimizerRepo implements OptimizerStateRepository {
  private familyStates = new Map<string, FamilySelectionState>();
  private candidateStates = new Map<string, CandidatePerformanceState[]>();

  setFamilyState(state: FamilySelectionState) {
    this.familyStates.set(state.familyKey, state);
  }

  setCandidateStates(familyKey: string, states: CandidatePerformanceState[]) {
    this.candidateStates.set(familyKey, states);
  }

  async getFamilyState(familyKey: string): Promise<FamilySelectionState | undefined> {
    return this.familyStates.get(familyKey);
  }

  async getCandidateStates(familyKey: string): Promise<CandidatePerformanceState[]> {
    return this.candidateStates.get(familyKey) ?? [];
  }

  async saveFamilyState(state: FamilySelectionState): Promise<void> {
    this.familyStates.set(state.familyKey, state);
  }

  async saveCandidateState(state: CandidatePerformanceState): Promise<void> {
    const existing = this.candidateStates.get(state.familyKey) ?? [];
    const idx = existing.findIndex((c) => c.candidateId === state.candidateId);
    if (idx >= 0) {
      existing[idx] = state;
    } else {
      existing.push(state);
    }
    this.candidateStates.set(state.familyKey, existing);
  }

  async listFamilies(): Promise<string[]> {
    return [...this.familyStates.keys()];
  }
}

// ── Collecting helpers ────────────────────────────────────────────────────

class CollectingRollbackWriter implements RollbackRecordWriter {
  readonly records: AdaptationRollbackRecord[] = [];

  async save(record: AdaptationRollbackRecord): Promise<void> {
    this.records.push(record);
  }
}

class CollectingRollbackAuditEmitter implements RollbackAuditEmitter {
  readonly events: RollbackAuditEvent[] = [];

  emit(event: RollbackAuditEvent): void {
    this.events.push(event);
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const FAMILY_KEY = 'test.family.advisory';
const EVENT_ID = randomUUID();

function makeCandidate(id: string, score: number): CandidatePerformanceState {
  return {
    candidateId: id,
    familyKey: FAMILY_KEY,
    rollingScore: score,
    runCount: 25,
    successRate: 0.9,
    averageLatency: 500,
    lastSelectedAt: new Date().toISOString(),
  };
}

function makeRankedCandidate(id: string, rank: number, score: number): RankedCandidate {
  return {
    candidate: makeCandidate(id, score),
    rank,
    compositeScore: score,
    scoreBreakdown: {
      performanceComponent: score,
      recencyComponent: 0.5,
      successRateComponent: 0.9,
    },
  };
}

function makeAdaptationEvent(overrides?: Partial<AdaptationEvent>): AdaptationEvent {
  return {
    id: EVENT_ID,
    familyKey: FAMILY_KEY,
    trigger: 'plateau_detected',
    mode: 'recommend_only',
    previousRanking: [
      makeRankedCandidate('candidate-a', 1, 0.80),
      makeRankedCandidate('candidate-b', 2, 0.70),
    ],
    newRanking: [
      makeRankedCandidate('candidate-b', 1, 0.85),
      makeRankedCandidate('candidate-a', 2, 0.75),
    ],
    policyBoundsSnapshot: {
      maxCandidates: 5,
      explorationRate: 0.1,
      maxExplorationRate: 0.3,
    },
    evidenceSummary: 'Plateau detected. Reranking candidates.',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as AdaptationEvent;
}

function setupDefaults(
  ledger: InMemoryLedger,
  optimizerRepo: InMemoryOptimizerRepo,
) {
  ledger.addEvent(makeAdaptationEvent());

  optimizerRepo.setFamilyState({
    familyKey: FAMILY_KEY,
    currentCandidateId: 'candidate-b',
    rollingScore: 0.85,
    explorationRate: 0.1,
    plateauDetected: false,
    lastAdaptationAt: new Date().toISOString(),
    recentTrend: 'stable',
  });

  optimizerRepo.setCandidateStates(FAMILY_KEY, [
    makeCandidate('candidate-b', 0.85),
    makeCandidate('candidate-a', 0.75),
  ]);
}

// ===========================================================================
// Rollback Preview
// ===========================================================================

describe('Adaptation Rollback – Preview', () => {
  let ledger: InMemoryLedger;
  let optimizerRepo: InMemoryOptimizerRepo;
  let rollbackWriter: CollectingRollbackWriter;
  let auditEmitter: CollectingRollbackAuditEmitter;
  let service: AdaptationRollbackService;

  beforeEach(() => {
    ledger = new InMemoryLedger();
    optimizerRepo = new InMemoryOptimizerRepo();
    rollbackWriter = new CollectingRollbackWriter();
    auditEmitter = new CollectingRollbackAuditEmitter();
    service = new AdaptationRollbackService(ledger, optimizerRepo, rollbackWriter, auditEmitter);
    setupDefaults(ledger, optimizerRepo);
  });

  it('returns a preview without mutating state', async () => {
    const preview = await service.previewRollback(FAMILY_KEY, EVENT_ID);

    expect(preview).toBeDefined();
    expect(preview.preview.familyKey).toBe(FAMILY_KEY);
    expect(preview.preview.targetAdaptationEventId).toBe(EVENT_ID);
    // No records should be persisted from preview
    expect(rollbackWriter.records).toHaveLength(0);
  });

  it('includes current and restored snapshots', async () => {
    const preview = await service.previewRollback(FAMILY_KEY, EVENT_ID);

    expect(preview.preview.previousSnapshot.familyKey).toBe(FAMILY_KEY);
    expect(preview.preview.previousSnapshot.candidateRankings.length).toBeGreaterThan(0);
    expect(preview.preview.restoredSnapshot.familyKey).toBe(FAMILY_KEY);
    expect(preview.preview.restoredSnapshot.candidateRankings.length).toBeGreaterThan(0);
  });

  it('marks a recent event as safe', async () => {
    const preview = await service.previewRollback(FAMILY_KEY, EVENT_ID);

    expect(preview.safe).toBe(true);
    expect(preview.warnings).toHaveLength(0);
  });

  it('flags a very old event as unsafe', async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    ledger.addEvent(makeAdaptationEvent({ id: 'old-event', createdAt: oldDate }));

    const preview = await service.previewRollback(FAMILY_KEY, 'old-event');

    expect(preview.safe).toBe(false);
    expect(preview.warnings.length).toBeGreaterThan(0);
    expect(preview.warnings[0]).toContain('days old');
  });
});

// ===========================================================================
// Rollback Execution
// ===========================================================================

describe('Adaptation Rollback – Execution', () => {
  let ledger: InMemoryLedger;
  let optimizerRepo: InMemoryOptimizerRepo;
  let rollbackWriter: CollectingRollbackWriter;
  let auditEmitter: CollectingRollbackAuditEmitter;
  let service: AdaptationRollbackService;

  beforeEach(() => {
    ledger = new InMemoryLedger();
    optimizerRepo = new InMemoryOptimizerRepo();
    rollbackWriter = new CollectingRollbackWriter();
    auditEmitter = new CollectingRollbackAuditEmitter();
    service = new AdaptationRollbackService(ledger, optimizerRepo, rollbackWriter, auditEmitter);
    setupDefaults(ledger, optimizerRepo);
  });

  it('executes a safe rollback successfully', async () => {
    const record = await service.executeRollback(
      FAMILY_KEY,
      EVENT_ID,
      'operator@acds',
      'Performance degradation after last change.',
    );

    expect(record.id).toBeDefined();
    expect(record.familyKey).toBe(FAMILY_KEY);
    expect(record.targetAdaptationEventId).toBe(EVENT_ID);
    expect(record.actor).toBe('operator@acds');
    expect(record.reason).toBe('Performance degradation after last change.');
  });

  it('persists the rollback record', async () => {
    await service.executeRollback(FAMILY_KEY, EVENT_ID, 'operator@acds', 'Rolling back');

    expect(rollbackWriter.records).toHaveLength(1);
    expect(rollbackWriter.records[0].familyKey).toBe(FAMILY_KEY);
  });
});

// ===========================================================================
// Invalid Rollback Rejection
// ===========================================================================

describe('Adaptation Rollback – Invalid Rejection', () => {
  let ledger: InMemoryLedger;
  let optimizerRepo: InMemoryOptimizerRepo;
  let rollbackWriter: CollectingRollbackWriter;
  let auditEmitter: CollectingRollbackAuditEmitter;
  let service: AdaptationRollbackService;

  beforeEach(() => {
    ledger = new InMemoryLedger();
    optimizerRepo = new InMemoryOptimizerRepo();
    rollbackWriter = new CollectingRollbackWriter();
    auditEmitter = new CollectingRollbackAuditEmitter();
    service = new AdaptationRollbackService(ledger, optimizerRepo, rollbackWriter, auditEmitter);
    setupDefaults(ledger, optimizerRepo);
  });

  it('throws when the target event does not exist', async () => {
    await expect(
      service.executeRollback(FAMILY_KEY, 'nonexistent', 'operator@acds', 'Test'),
    ).rejects.toThrow(/not found/);
  });

  it('throws when the event belongs to a different family', async () => {
    ledger.addEvent(makeAdaptationEvent({ id: 'other-event', familyKey: 'other.family' }));

    await expect(
      service.executeRollback(FAMILY_KEY, 'other-event', 'operator@acds', 'Test'),
    ).rejects.toThrow(/belongs to family/);
  });

  it('throws when family state does not exist', async () => {
    ledger.addEvent(makeAdaptationEvent({ id: 'orphan-event', familyKey: 'orphan.family' }));

    await expect(
      service.executeRollback('orphan.family', 'orphan-event', 'operator@acds', 'Test'),
    ).rejects.toThrow(/state not found/);
  });

  it('refuses execution for unsafe rollbacks (old events)', async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    ledger.addEvent(makeAdaptationEvent({ id: 'old-event', createdAt: oldDate }));

    await expect(
      service.executeRollback(FAMILY_KEY, 'old-event', 'operator@acds', 'Test'),
    ).rejects.toThrow(/not safe/);
  });
});

// ===========================================================================
// Rollback Audit Emission
// ===========================================================================

describe('Adaptation Rollback – Audit Emission', () => {
  let ledger: InMemoryLedger;
  let optimizerRepo: InMemoryOptimizerRepo;
  let rollbackWriter: CollectingRollbackWriter;
  let auditEmitter: CollectingRollbackAuditEmitter;
  let service: AdaptationRollbackService;

  beforeEach(() => {
    ledger = new InMemoryLedger();
    optimizerRepo = new InMemoryOptimizerRepo();
    rollbackWriter = new CollectingRollbackWriter();
    auditEmitter = new CollectingRollbackAuditEmitter();
    service = new AdaptationRollbackService(ledger, optimizerRepo, rollbackWriter, auditEmitter);
    setupDefaults(ledger, optimizerRepo);
  });

  it('emits a rollback_executed audit event on successful execution', async () => {
    await service.executeRollback(FAMILY_KEY, EVENT_ID, 'operator@acds', 'Performance issue');

    const executedEvents = auditEmitter.events.filter((e) => e.type === 'rollback_executed');
    expect(executedEvents).toHaveLength(1);
    expect(executedEvents[0].familyKey).toBe(FAMILY_KEY);
    expect(executedEvents[0].targetAdaptationEventId).toBe(EVENT_ID);
    expect(executedEvents[0].actor).toBe('operator@acds');
    expect(executedEvents[0].reason).toBe('Performance issue');
    expect(executedEvents[0].timestamp).toBeDefined();
  });

  it('does not emit audit events for failed rollbacks', async () => {
    try {
      await service.executeRollback(FAMILY_KEY, 'nonexistent', 'operator@acds', 'Test');
    } catch {
      // Expected
    }

    expect(auditEmitter.events).toHaveLength(0);
  });
});
