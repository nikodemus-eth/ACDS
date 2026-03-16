// ---------------------------------------------------------------------------
// Integration Tests – Adaptation API (Prompt 59)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Types for the adaptation API domain
// ---------------------------------------------------------------------------

type SelectionMode = 'observe_only' | 'recommend_only' | 'auto_apply_low_risk' | 'auto_apply_all';

interface AdaptationFamilySummary {
  familyKey: string;
  application: string;
  process: string;
  step: string;
  currentProfileId: string;
  selectionMode: SelectionMode;
  recentScore: number;
}

interface AdaptationFamilyDetail extends AdaptationFamilySummary {
  scoreHistory: number[];
  candidateScores: Record<string, number>;
  plateauSeverity: 'none' | 'mild' | 'severe';
  lastAdaptedAt: Date | null;
}

interface AdaptationEvent {
  id: string;
  familyKey: string;
  eventType: 'profile_changed' | 'plateau_detected' | 'exploration_triggered' | 'recommendation_issued';
  previousProfileId: string | null;
  newProfileId: string | null;
  reason: string;
  timestamp: Date;
}

interface AdaptationRecommendation {
  id: string;
  familyKey: string;
  recommendedProfileId: string;
  currentProfileId: string;
  expectedImprovement: number;
  status: 'pending' | 'applied' | 'dismissed';
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Mock API controller (simulates adaptation REST endpoints)
// ---------------------------------------------------------------------------

class MockAdaptationAPI {
  private families: AdaptationFamilyDetail[] = [];
  private events: AdaptationEvent[] = [];
  private recommendations: AdaptationRecommendation[] = [];

  constructor() {
    this.seedData();
  }

  private seedData(): void {
    const now = new Date();

    this.families = [
      {
        familyKey: 'thingstead.governance.advisory',
        application: 'thingstead',
        process: 'governance',
        step: 'advisory',
        currentProfileId: 'profile-local',
        selectionMode: 'auto_apply_low_risk',
        recentScore: 0.82,
        scoreHistory: [0.75, 0.78, 0.80, 0.81, 0.82],
        candidateScores: { 'profile-local': 0.82, 'profile-cloud': 0.88 },
        plateauSeverity: 'none',
        lastAdaptedAt: new Date(now.getTime() - 3_600_000),
      },
      {
        familyKey: 'process-swarm.generation.draft',
        application: 'process-swarm',
        process: 'generation',
        step: 'draft',
        currentProfileId: 'profile-fast',
        selectionMode: 'recommend_only',
        recentScore: 0.71,
        scoreHistory: [0.70, 0.71, 0.71, 0.71, 0.71],
        candidateScores: { 'profile-fast': 0.71, 'profile-balanced': 0.76 },
        plateauSeverity: 'mild',
        lastAdaptedAt: null,
      },
      {
        familyKey: 'thingstead.legal.review',
        application: 'thingstead',
        process: 'legal',
        step: 'review',
        currentProfileId: 'profile-strong',
        selectionMode: 'observe_only',
        recentScore: 0.90,
        scoreHistory: [0.88, 0.89, 0.90, 0.90, 0.90],
        candidateScores: { 'profile-strong': 0.90 },
        plateauSeverity: 'none',
        lastAdaptedAt: null,
      },
    ];

    this.events = [
      {
        id: 'evt-001',
        familyKey: 'thingstead.governance.advisory',
        eventType: 'profile_changed',
        previousProfileId: 'profile-cloud',
        newProfileId: 'profile-local',
        reason: 'adaptive selection found local profile scoring higher',
        timestamp: new Date(now.getTime() - 3_600_000),
      },
      {
        id: 'evt-002',
        familyKey: 'process-swarm.generation.draft',
        eventType: 'plateau_detected',
        previousProfileId: null,
        newProfileId: null,
        reason: 'flat quality score over 5 evaluation windows',
        timestamp: new Date(now.getTime() - 1_800_000),
      },
      {
        id: 'evt-003',
        familyKey: 'thingstead.governance.advisory',
        eventType: 'exploration_triggered',
        previousProfileId: 'profile-local',
        newProfileId: 'profile-experimental',
        reason: 'exploration policy triggered for low-consequence family',
        timestamp: new Date(now.getTime() - 900_000),
      },
    ];

    this.recommendations = [
      {
        id: 'rec-001',
        familyKey: 'process-swarm.generation.draft',
        recommendedProfileId: 'profile-balanced',
        currentProfileId: 'profile-fast',
        expectedImprovement: 0.05,
        status: 'pending',
        createdAt: new Date(now.getTime() - 1_200_000),
      },
      {
        id: 'rec-002',
        familyKey: 'thingstead.governance.advisory',
        recommendedProfileId: 'profile-cloud',
        currentProfileId: 'profile-local',
        expectedImprovement: 0.06,
        status: 'pending',
        createdAt: new Date(now.getTime() - 600_000),
      },
    ];
  }

  // GET /adaptation/families
  listFamilies(): { status: number; body: AdaptationFamilySummary[] } {
    const summaries: AdaptationFamilySummary[] = this.families.map(
      ({ familyKey, application, process, step, currentProfileId, selectionMode, recentScore }) => ({
        familyKey,
        application,
        process,
        step,
        currentProfileId,
        selectionMode,
        recentScore,
      }),
    );
    return { status: 200, body: summaries };
  }

  // GET /adaptation/families/:key
  getFamily(key: string): { status: number; body: AdaptationFamilyDetail | { error: string } } {
    const family = this.families.find((f) => f.familyKey === key);
    if (!family) {
      return { status: 404, body: { error: `Family ${key} not found` } };
    }
    return { status: 200, body: family };
  }

  // GET /adaptation/events
  listEvents(familyKey?: string): { status: number; body: AdaptationEvent[] } {
    const filtered = familyKey
      ? this.events.filter((e) => e.familyKey === familyKey)
      : this.events;
    return { status: 200, body: filtered };
  }

  // GET /adaptation/recommendations
  listRecommendations(status?: 'pending' | 'applied' | 'dismissed'): {
    status: number;
    body: AdaptationRecommendation[];
  } {
    const filtered = status
      ? this.recommendations.filter((r) => r.status === status)
      : this.recommendations;
    return { status: 200, body: filtered };
  }
}

// ===========================================================================
// GET /adaptation/families
// ===========================================================================

describe('Adaptation API – GET /adaptation/families', () => {
  let api: MockAdaptationAPI;

  beforeEach(() => {
    api = new MockAdaptationAPI();
  });

  it('returns a list of all adaptation families', () => {
    const response = api.listFamilies();

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(3);
  });

  it('each family summary has the expected shape', () => {
    const response = api.listFamilies();
    const summary = response.body[0];

    expect(summary).toHaveProperty('familyKey');
    expect(summary).toHaveProperty('application');
    expect(summary).toHaveProperty('process');
    expect(summary).toHaveProperty('step');
    expect(summary).toHaveProperty('currentProfileId');
    expect(summary).toHaveProperty('selectionMode');
    expect(summary).toHaveProperty('recentScore');
  });

  it('includes families from different applications', () => {
    const response = api.listFamilies();
    const apps = new Set(response.body.map((f) => f.application));

    expect(apps.has('thingstead')).toBe(true);
    expect(apps.has('process-swarm')).toBe(true);
  });
});

// ===========================================================================
// GET /adaptation/families/:key
// ===========================================================================

describe('Adaptation API – GET /adaptation/families/:key', () => {
  let api: MockAdaptationAPI;

  beforeEach(() => {
    api = new MockAdaptationAPI();
  });

  it('returns detail for a known family key', () => {
    const response = api.getFamily('thingstead.governance.advisory');

    expect(response.status).toBe(200);
    const detail = response.body as AdaptationFamilyDetail;
    expect(detail.familyKey).toBe('thingstead.governance.advisory');
    expect(detail.scoreHistory).toBeDefined();
    expect(detail.candidateScores).toBeDefined();
    expect(detail.plateauSeverity).toBeDefined();
  });

  it('includes score history array', () => {
    const response = api.getFamily('thingstead.governance.advisory');
    const detail = response.body as AdaptationFamilyDetail;

    expect(Array.isArray(detail.scoreHistory)).toBe(true);
    expect(detail.scoreHistory.length).toBeGreaterThan(0);
    detail.scoreHistory.forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });
  });

  it('includes candidate scores map', () => {
    const response = api.getFamily('thingstead.governance.advisory');
    const detail = response.body as AdaptationFamilyDetail;

    expect(typeof detail.candidateScores).toBe('object');
    expect(Object.keys(detail.candidateScores).length).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown family key', () => {
    const response = api.getFamily('nonexistent.family.key');

    expect(response.status).toBe(404);
    expect((response.body as { error: string }).error).toContain('not found');
  });
});

// ===========================================================================
// GET /adaptation/events
// ===========================================================================

describe('Adaptation API – GET /adaptation/events', () => {
  let api: MockAdaptationAPI;

  beforeEach(() => {
    api = new MockAdaptationAPI();
  });

  it('returns all adaptation events', () => {
    const response = api.listEvents();

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(3);
  });

  it('each event has the expected shape', () => {
    const response = api.listEvents();

    for (const event of response.body) {
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('familyKey');
      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('reason');
      expect(event).toHaveProperty('timestamp');
    }
  });

  it('filters events by family key', () => {
    const response = api.listEvents('thingstead.governance.advisory');

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(2);
    response.body.forEach((e) => {
      expect(e.familyKey).toBe('thingstead.governance.advisory');
    });
  });

  it('contains expected event types', () => {
    const response = api.listEvents();
    const types = response.body.map((e) => e.eventType);

    expect(types).toContain('profile_changed');
    expect(types).toContain('plateau_detected');
    expect(types).toContain('exploration_triggered');
  });
});

// ===========================================================================
// GET /adaptation/recommendations
// ===========================================================================

describe('Adaptation API – GET /adaptation/recommendations', () => {
  let api: MockAdaptationAPI;

  beforeEach(() => {
    api = new MockAdaptationAPI();
  });

  it('returns all recommendations', () => {
    const response = api.listRecommendations();

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(2);
  });

  it('each recommendation has the expected shape', () => {
    const response = api.listRecommendations();

    for (const rec of response.body) {
      expect(rec).toHaveProperty('id');
      expect(rec).toHaveProperty('familyKey');
      expect(rec).toHaveProperty('recommendedProfileId');
      expect(rec).toHaveProperty('currentProfileId');
      expect(rec).toHaveProperty('expectedImprovement');
      expect(rec).toHaveProperty('status');
      expect(rec).toHaveProperty('createdAt');
    }
  });

  it('filters recommendations by pending status', () => {
    const response = api.listRecommendations('pending');

    expect(response.status).toBe(200);
    response.body.forEach((rec) => {
      expect(rec.status).toBe('pending');
    });
  });

  it('recommendations reference different families', () => {
    const response = api.listRecommendations();
    const families = new Set(response.body.map((r) => r.familyKey));

    expect(families.size).toBe(2);
  });

  it('expected improvement is a positive number', () => {
    const response = api.listRecommendations();

    response.body.forEach((rec) => {
      expect(rec.expectedImprovement).toBeGreaterThan(0);
    });
  });
});
