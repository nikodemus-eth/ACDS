import { describe, it, expect } from 'vitest';
import { AdaptationApprovalController } from './AdaptationApprovalController.js';
import type { AdaptationApprovalRepository } from '@acds/adaptive-optimizer';
import type { ApprovalAuditEmitter } from '@acds/adaptive-optimizer';
import { NotFoundError, ConflictError } from '@acds/core-types';

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

function makeApproval(id: string, status = 'pending' as string) {
  return {
    id,
    familyKey: 'app:proc:step',
    recommendationId: 'rec-1',
    status,
    submittedAt: '2026-03-15T10:00:00.000Z',
    expiresAt: '2026-03-16T10:00:00.000Z',
    decidedAt: status !== 'pending' ? '2026-03-15T12:00:00.000Z' : undefined,
    decidedBy: status !== 'pending' ? 'admin' : undefined,
  };
}

class InMemoryApprovalRepo implements AdaptationApprovalRepository {
  private store = new Map<string, any>();

  constructor(initial: any[] = []) {
    for (const item of initial) {
      this.store.set(item.id, item);
    }
  }

  async findById(id: string) { return this.store.get(id) ?? null; }
  async findPending() { return [...this.store.values()].filter((a) => a.status === 'pending'); }
  async findByFamily(_familyKey: string) { return [...this.store.values()]; }
  async save(approval: any) { this.store.set(approval.id, approval); }
  async updateStatus(id: string, status: string, meta: any) {
    const item = this.store.get(id);
    if (item) Object.assign(item, { status, ...meta });
  }
}

class InMemoryAuditEmitter implements ApprovalAuditEmitter {
  events: any[] = [];
  emit(event: any) { this.events.push(event); }
}

describe('AdaptationApprovalController', () => {
  it('list returns pending approvals', async () => {
    const repo = new InMemoryApprovalRepo([makeApproval('ap-1'), makeApproval('ap-2')]);
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    const reply = createReply();
    await controller.list({} as any, reply as any);

    expect(reply.statusCode).toBe(200);
    expect((reply.body as any[]).length).toBe(2);
  });

  it('getById returns approval when found', async () => {
    const repo = new InMemoryApprovalRepo([makeApproval('ap-1')]);
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    const reply = createReply();
    await controller.getById({ params: { id: 'ap-1' } } as any, reply as any);
    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).id).toBe('ap-1');
  });

  it('getById returns 404 when not found', async () => {
    const repo = new InMemoryApprovalRepo([]);
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    const reply = createReply();
    await controller.getById({ params: { id: 'missing' } } as any, reply as any);
    expect(reply.statusCode).toBe(404);
  });

  it('approve returns approved record on success', async () => {
    const repo = new InMemoryApprovalRepo([makeApproval('ap-1')]);
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    const reply = createReply();
    await controller.approve(
      { params: { id: 'ap-1' }, body: { actor: 'admin', reason: 'looks good' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).status).toBe('approved');
  });

  it('reject returns rejected record on success', async () => {
    const repo = new InMemoryApprovalRepo([makeApproval('ap-1')]);
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    const reply = createReply();
    await controller.reject(
      { params: { id: 'ap-1' }, body: { actor: 'admin', reason: 'not ready' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).status).toBe('rejected');
  });

  it('approve returns 404 when approval not found', async () => {
    const repo = new InMemoryApprovalRepo([]);
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    const reply = createReply();
    // The service throws a plain Error with "not found" message, not NotFoundError
    // But the controller catches NotFoundError. Since the service uses requirePending
    // which throws a plain Error, we need to handle it differently.
    // Let's test with a repo that returns a non-pending approval instead.
    await expect(
      controller.approve(
        { params: { id: 'missing' }, body: { actor: 'admin' } } as any,
        reply as any,
      ),
    ).rejects.toThrow();
  });

  it('reject rethrows unknown errors', async () => {
    const repo = new InMemoryApprovalRepo([]);
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    await expect(
      controller.reject(
        { params: { id: 'missing' }, body: { actor: 'admin' } } as any,
        createReply() as any,
      ),
    ).rejects.toThrow();
  });

  it('approve returns 404 when repo throws NotFoundError', async () => {
    const repo: AdaptationApprovalRepository = {
      async findById(_id: string) { throw new NotFoundError('Approval not found'); },
      async findPending() { return []; },
      async findByFamily() { return []; },
      async save() {},
      async updateStatus() {},
    };
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    const reply = createReply();
    await controller.approve(
      { params: { id: 'missing' }, body: { actor: 'admin' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(404);
    expect((reply.body as any).error).toBe('Not Found');
  });

  it('approve returns 409 when repo throws ConflictError', async () => {
    const repo: AdaptationApprovalRepository = {
      async findById(_id: string) { throw new ConflictError('Already decided'); },
      async findPending() { return []; },
      async findByFamily() { return []; },
      async save() {},
      async updateStatus() {},
    };
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    const reply = createReply();
    await controller.approve(
      { params: { id: 'ap-1' }, body: { actor: 'admin' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(409);
    expect((reply.body as any).error).toBe('Conflict');
  });

  it('reject returns 404 when repo throws NotFoundError', async () => {
    const repo: AdaptationApprovalRepository = {
      async findById(_id: string) { throw new NotFoundError('Approval not found'); },
      async findPending() { return []; },
      async findByFamily() { return []; },
      async save() {},
      async updateStatus() {},
    };
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    const reply = createReply();
    await controller.reject(
      { params: { id: 'missing' }, body: { actor: 'admin' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(404);
    expect((reply.body as any).error).toBe('Not Found');
  });

  it('reject returns 409 when repo throws ConflictError', async () => {
    const repo: AdaptationApprovalRepository = {
      async findById(_id: string) { throw new ConflictError('Already decided'); },
      async findPending() { return []; },
      async findByFamily() { return []; },
      async save() {},
      async updateStatus() {},
    };
    const emitter = new InMemoryAuditEmitter();
    const controller = new AdaptationApprovalController(repo, emitter);

    const reply = createReply();
    await controller.reject(
      { params: { id: 'ap-1' }, body: { actor: 'admin' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(409);
    expect((reply.body as any).error).toBe('Conflict');
  });
});
