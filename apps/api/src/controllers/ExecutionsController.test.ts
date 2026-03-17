import { describe, it, expect } from 'vitest';
import { ExecutionsController } from './ExecutionsController.js';

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

function makeRecord(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    executionFamily: {
      application: 'test_app',
      process: 'review',
      step: 'analyze',
      decisionPosture: 'operational',
      cognitiveGrade: 'standard',
    },
    routingDecisionId: 'rd-1',
    selectedModelProfileId: 'model-1',
    selectedTacticProfileId: 'tactic-1',
    selectedProviderId: 'prov-1',
    status: 'succeeded',
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 200,
    costEstimate: 0.01,
    normalizedOutput: 'output',
    errorMessage: null,
    fallbackAttempts: 0,
    createdAt: new Date('2026-03-15T10:00:00Z'),
    completedAt: new Date('2026-03-15T10:00:01Z'),
    ...overrides,
  };
}

describe('ExecutionsController', () => {
  it('list delegates to getByFamily when family is provided', async () => {
    let capturedFamily = '';
    const service = {
      getByFamily: async (family: string, _limit?: number) => {
        capturedFamily = family;
        return [makeRecord('exec-1')];
      },
      getFiltered: async () => [],
      getRecent: async () => [],
      getById: async () => null,
    };

    const controller = new ExecutionsController(service as any);
    const reply = createReply();
    await controller.list({ query: { family: 'test_family' } } as any, reply as any);

    expect(capturedFamily).toBe('test_family');
    expect((reply.body as any[]).length).toBe(1);
  });

  it('list delegates to getFiltered when status is provided', async () => {
    let filtered = false;
    const service = {
      getByFamily: async () => [],
      getFiltered: async () => { filtered = true; return [makeRecord('exec-2')]; },
      getRecent: async () => [],
      getById: async () => null,
    };

    const controller = new ExecutionsController(service as any);
    const reply = createReply();
    await controller.list({ query: { status: 'succeeded' } } as any, reply as any);

    expect(filtered).toBe(true);
    expect((reply.body as any[]).length).toBe(1);
  });

  it('list delegates to getFiltered when application is provided', async () => {
    let filtered = false;
    const service = {
      getByFamily: async () => [],
      getFiltered: async () => { filtered = true; return []; },
      getRecent: async () => [],
      getById: async () => null,
    };

    const controller = new ExecutionsController(service as any);
    const reply = createReply();
    await controller.list({ query: { application: 'myapp' } } as any, reply as any);
    expect(filtered).toBe(true);
  });

  it('list delegates to getFiltered when from is provided', async () => {
    let filtered = false;
    const service = {
      getByFamily: async () => [],
      getFiltered: async () => { filtered = true; return []; },
      getRecent: async () => [],
      getById: async () => null,
    };

    const controller = new ExecutionsController(service as any);
    const reply = createReply();
    await controller.list({ query: { from: '2026-01-01' } } as any, reply as any);
    expect(filtered).toBe(true);
  });

  it('list delegates to getFiltered when to is provided', async () => {
    let filtered = false;
    const service = {
      getByFamily: async () => [],
      getFiltered: async () => { filtered = true; return []; },
      getRecent: async () => [],
      getById: async () => null,
    };

    const controller = new ExecutionsController(service as any);
    const reply = createReply();
    await controller.list({ query: { to: '2026-12-31' } } as any, reply as any);
    expect(filtered).toBe(true);
  });

  it('list defaults to getRecent when no filters', async () => {
    let recent = false;
    const service = {
      getByFamily: async () => [],
      getFiltered: async () => [],
      getRecent: async () => { recent = true; return [makeRecord('exec-3')]; },
      getById: async () => null,
    };

    const controller = new ExecutionsController(service as any);
    const reply = createReply();
    await controller.list({ query: {} } as any, reply as any);

    expect(recent).toBe(true);
  });

  it('getById returns the record when found', async () => {
    const service = {
      getByFamily: async () => [],
      getFiltered: async () => [],
      getRecent: async () => [],
      getById: async (id: string) => makeRecord(id),
    };

    const controller = new ExecutionsController(service as any);
    const reply = createReply();
    await controller.getById({ params: { id: 'exec-10' } } as any, reply as any);

    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).id).toBe('exec-10');
    expect((reply.body as any).rationaleSummary).toBeDefined();
  });

  it('getById returns 404 when not found', async () => {
    const service = {
      getByFamily: async () => [],
      getFiltered: async () => [],
      getRecent: async () => [],
      getById: async () => null,
    };

    const controller = new ExecutionsController(service as any);
    const reply = createReply();
    await controller.getById({ params: { id: 'missing' } } as any, reply as any);

    expect(reply.statusCode).toBe(404);
    expect((reply.body as any).message).toContain('missing');
  });
});
