import { describe, it, expect } from 'vitest';
import { AdaptationController } from './AdaptationController.js';
import type {
  FamilyPerformanceReader,
  CandidateRankingReader,
  AdaptationEventReader,
  AdaptationRecommendationReader,
} from './AdaptationController.js';

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

function makeSummary(familyKey: string, overrides: Record<string, unknown> = {}) {
  return {
    familyKey,
    rollingScore: 0.85,
    runCount: 10,
    recentFailureCount: 1,
    metricTrends: [{ label: 'latency', mean: 200, latest: 180 }],
    lastUpdated: new Date('2026-03-15T10:00:00Z'),
    ...overrides,
  };
}

describe('AdaptationController', () => {
  function makeController(overrides: Record<string, any> = {}) {
    const performanceReader: FamilyPerformanceReader = {
      listAll: async () => [makeSummary('app:proc:step')],
      getByFamilyKey: async (key) => key === 'app:proc:step' ? makeSummary(key) : null,
      ...overrides.performanceReader,
    };
    const candidateReader: CandidateRankingReader = {
      getCandidatesForFamily: async () => [
        { candidateId: 'c1', familyKey: 'f', rollingScore: 0.8, runCount: 5, successRate: 0.9, averageLatency: 100, lastSelectedAt: '2026-01-01' },
      ],
      ...overrides.candidateReader,
    };
    const eventReader: AdaptationEventReader = {
      find: async () => [
        {
          id: 'evt-1', familyKey: 'f', trigger: 'performance_decline', mode: 'auto',
          previousRanking: [{ candidateId: 'c1', rank: 1, score: 0.8 }],
          newRanking: [{ candidateId: 'c1', rank: 1, score: 0.9 }],
          evidenceSummary: 'Score improved', createdAt: '2026-03-15T10:00:00Z',
        },
      ],
      ...overrides.eventReader,
    };
    const recommendationReader: AdaptationRecommendationReader = {
      listPending: async () => [{ id: 'rec-1', familyKey: 'f', type: 'promote' }],
      ...overrides.recommendationReader,
    };

    return new AdaptationController(
      performanceReader,
      candidateReader,
      eventReader,
      recommendationReader,
    );
  }

  it('listFamilies returns formatted performance summaries', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.listFamilies({} as any, reply as any);

    expect(reply.statusCode).toBe(200);
    expect((reply.body as any[]).length).toBe(1);
    expect((reply.body as any[])[0].familyKey).toBe('app:proc:step');
  });

  it('getFamilyDetail returns 404 for unknown family', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.getFamilyDetail(
      { params: { familyKey: 'unknown' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(404);
  });

  it('getFamilyDetail returns summary when found', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.getFamilyDetail(
      { params: { familyKey: 'app:proc:step' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).familyKey).toBe('app:proc:step');
  });

  it('getCandidateRankings returns candidates', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.getCandidateRankings(
      { params: { familyKey: 'f' } } as any,
      reply as any,
    );
    expect((reply.body as any[]).length).toBe(1);
  });

  it('listAdaptationEvents passes filters and returns events', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.listAdaptationEvents(
      { query: { trigger: 'performance_decline', limit: '10' } } as any,
      reply as any,
    );
    expect((reply.body as any[]).length).toBe(1);
    expect((reply.body as any[])[0].trigger).toBe('performance_decline');
  });

  it('listAdaptationEvents handles missing limit', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.listAdaptationEvents(
      { query: {} } as any,
      reply as any,
    );
    expect((reply.body as any[]).length).toBe(1);
  });

  it('listRecommendations returns pending recommendations', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.listRecommendations({} as any, reply as any);
    expect((reply.body as any[]).length).toBe(1);
  });
});
