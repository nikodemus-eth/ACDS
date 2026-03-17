import { describe, it, expect } from 'vitest';
import { DispatchController } from './DispatchController.js';

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

describe('DispatchController', () => {
  const fakeDecision = {
    id: 'dec-1',
    selectedModelProfileId: 'model-1',
    selectedTacticProfileId: 'tactic-1',
    selectedProviderId: 'prov-1',
    fallbackChain: [
      { modelProfileId: 'model-2', tacticProfileId: 'tactic-1', providerId: 'prov-2', priority: 1 },
    ],
    rationaleSummary: 'Profile selected | Tactic selected',
    resolvedAt: new Date('2026-03-15T10:00:00Z'),
  };

  const fakeRunService = {
    resolveRoute: async (_body: unknown) => ({ decision: fakeDecision }),
    run: async (body: unknown) => ({ status: 'completed', input: body }),
  };

  it('resolve sends a formatted routing decision view', async () => {
    const controller = new DispatchController(fakeRunService as any);
    const reply = createReply();
    await controller.resolve({ body: { application: 'app' } } as any, reply as any);

    expect(reply.statusCode).toBe(200);
    const body = reply.body as any;
    expect(body.id).toBe('dec-1');
    expect(body.selectedModelProfileId).toBe('model-1');
    expect(body.fallbackChain).toHaveLength(1);
    expect(body.resolvedAt).toBe('2026-03-15T10:00:00.000Z');
  });

  it('resolve returns 400 when the run service throws', async () => {
    const failingService = {
      resolveRoute: async () => { throw new Error('Invalid input'); },
      run: async () => ({}),
    };
    const controller = new DispatchController(failingService as any);
    const reply = createReply();
    await controller.resolve({ body: {} } as any, reply as any);

    expect(reply.statusCode).toBe(400);
    expect((reply.body as any).message).toBe('Invalid input');
  });

  it('resolve returns 400 with stringified non-Error throw', async () => {
    const failingService = {
      resolveRoute: async () => { throw 'string error'; },
      run: async () => ({}),
    };
    const controller = new DispatchController(failingService as any);
    const reply = createReply();
    await controller.resolve({ body: {} } as any, reply as any);

    expect(reply.statusCode).toBe(400);
    expect((reply.body as any).message).toBe('string error');
  });

  it('run forwards request body and sends response', async () => {
    const controller = new DispatchController(fakeRunService as any);
    const reply = createReply();
    await controller.run({ body: { prompt: 'hello' } } as any, reply as any);

    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).status).toBe('completed');
  });
});
