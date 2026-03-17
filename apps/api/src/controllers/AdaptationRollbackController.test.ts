import { describe, it, expect } from 'vitest';
import { AdaptationRollbackController } from './AdaptationRollbackController.js';
import { NotFoundError, ConflictError } from '@acds/core-types';

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

function makeRollbackRecord() {
  return {
    id: 'rb-1',
    familyKey: 'app:proc:step',
    targetAdaptationEventId: 'evt-1',
    previousSnapshot: {
      familyKey: 'app:proc:step',
      candidateRankings: [{ candidateId: 'c1', rank: 1, score: 0.8 }],
      explorationRate: 0.1,
      capturedAt: '2026-03-15T10:00:00Z',
    },
    restoredSnapshot: {
      familyKey: 'app:proc:step',
      candidateRankings: [{ candidateId: 'c1', rank: 1, score: 0.7 }],
      explorationRate: 0.15,
      capturedAt: '2026-03-14T10:00:00Z',
    },
    actor: 'admin',
    reason: 'Reverting bad change',
    rolledBackAt: '2026-03-15T12:00:00Z',
  };
}

describe('AdaptationRollbackController', () => {
  function makeService(overrides: Record<string, any> = {}) {
    return {
      previewRollback: async (_familyKey: string, _eventId: string) => ({
        safe: true,
        warnings: [],
        preview: makeRollbackRecord(),
      }),
      executeRollback: async () => makeRollbackRecord(),
      ...overrides,
    };
  }

  it('previewRollback returns 400 when targetEventId is missing', async () => {
    const controller = new AdaptationRollbackController(makeService() as any);
    const reply = createReply();
    await controller.previewRollback(
      { params: { familyKey: 'f' }, query: {} } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(400);
    expect((reply.body as any).message).toContain('targetEventId');
  });

  it('previewRollback returns preview on success', async () => {
    const controller = new AdaptationRollbackController(makeService() as any);
    const reply = createReply();
    await controller.previewRollback(
      { params: { familyKey: 'app:proc:step' }, query: { targetEventId: 'evt-1' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).safe).toBe(true);
    expect((reply.body as any).preview.familyKey).toBe('app:proc:step');
  });

  it('previewRollback returns 404 when NotFoundError is thrown', async () => {
    const service = makeService({
      previewRollback: async () => { throw new NotFoundError('not found'); },
    });
    const controller = new AdaptationRollbackController(service as any);
    const reply = createReply();
    await controller.previewRollback(
      { params: { familyKey: 'f' }, query: { targetEventId: 'evt-1' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(404);
  });

  it('previewRollback rethrows unknown errors', async () => {
    const service = makeService({
      previewRollback: async () => { throw new Error('unknown'); },
    });
    const controller = new AdaptationRollbackController(service as any);
    await expect(
      controller.previewRollback(
        { params: { familyKey: 'f' }, query: { targetEventId: 'evt-1' } } as any,
        createReply() as any,
      ),
    ).rejects.toThrow('unknown');
  });

  it('executeRollback returns 400 when required fields are missing', async () => {
    const controller = new AdaptationRollbackController(makeService() as any);
    const reply = createReply();
    await controller.executeRollback(
      { params: { familyKey: 'f' }, body: { targetEventId: 'evt-1', actor: 'admin' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(400);
  });

  it('executeRollback returns 400 when all fields are missing', async () => {
    const controller = new AdaptationRollbackController(makeService() as any);
    const reply = createReply();
    await controller.executeRollback(
      { params: { familyKey: 'f' }, body: {} } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(400);
  });

  it('executeRollback returns 201 on success', async () => {
    const controller = new AdaptationRollbackController(makeService() as any);
    const reply = createReply();
    await controller.executeRollback(
      {
        params: { familyKey: 'app:proc:step' },
        body: { targetEventId: 'evt-1', actor: 'admin', reason: 'revert' },
      } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(201);
    expect((reply.body as any).familyKey).toBe('app:proc:step');
  });

  it('executeRollback returns 404 for NotFoundError', async () => {
    const service = makeService({
      executeRollback: async () => { throw new NotFoundError('not found'); },
    });
    const controller = new AdaptationRollbackController(service as any);
    const reply = createReply();
    await controller.executeRollback(
      {
        params: { familyKey: 'f' },
        body: { targetEventId: 'x', actor: 'a', reason: 'r' },
      } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(404);
  });

  it('executeRollback returns 409 for ConflictError', async () => {
    const service = makeService({
      executeRollback: async () => { throw new ConflictError('conflict'); },
    });
    const controller = new AdaptationRollbackController(service as any);
    const reply = createReply();
    await controller.executeRollback(
      {
        params: { familyKey: 'f' },
        body: { targetEventId: 'x', actor: 'a', reason: 'r' },
      } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(409);
  });

  it('executeRollback rethrows unknown errors', async () => {
    const service = makeService({
      executeRollback: async () => { throw new Error('boom'); },
    });
    const controller = new AdaptationRollbackController(service as any);
    await expect(
      controller.executeRollback(
        {
          params: { familyKey: 'f' },
          body: { targetEventId: 'x', actor: 'a', reason: 'r' },
        } as any,
        createReply() as any,
      ),
    ).rejects.toThrow('boom');
  });
});
