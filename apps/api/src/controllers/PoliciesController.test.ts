import { describe, it, expect } from 'vitest';
import { PoliciesController } from './PoliciesController.js';

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

const now = new Date('2026-03-15T10:00:00Z');

function makeGlobalPolicy(id = 'global-1') {
  return {
    id,
    allowedVendors: ['openai'],
    blockedVendors: [],
    defaultPrivacy: 'cloud_allowed',
    defaultCostSensitivity: 'medium',
    structuredOutputRequiredForGrades: [],
    traceabilityRequiredForGrades: [],
    maxLatencyMsByLoadTier: {},
    localPreferredTaskTypes: [],
    cloudRequiredLoadTiers: [],
    enabled: true,
    updatedAt: now,
  };
}

function makeAppPolicy(id = 'app-1') {
  return {
    id,
    application: 'test_app',
    allowedVendors: ['openai'],
    blockedVendors: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    preferredModelProfileIds: null,
    blockedModelProfileIds: null,
    localPreferredTaskTypes: null,
    structuredOutputRequiredForGrades: null,
    enabled: true,
    updatedAt: now,
  };
}

function makeProcPolicy(id = 'proc-1') {
  return {
    id,
    application: 'test_app',
    process: 'review',
    step: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    allowedModelProfileIds: null,
    blockedModelProfileIds: null,
    allowedTacticProfileIds: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    forceEscalationForGrades: null,
    enabled: true,
    updatedAt: now,
  };
}

class InMemoryPolicyRepo {
  private global: any | null = null;
  private apps = new Map<string, any>();
  private procs = new Map<string, any>();

  constructor(options: { global?: any; apps?: any[]; procs?: any[] } = {}) {
    this.global = options.global ?? null;
    for (const a of options.apps ?? []) this.apps.set(a.id, a);
    for (const p of options.procs ?? []) this.procs.set(p.id, p);
  }

  async getGlobalPolicy() { return this.global; }
  async listApplicationPolicies() { return [...this.apps.values()]; }
  async listProcessPolicies() { return [...this.procs.values()]; }
  async findApplicationPolicyById(id: string) { return this.apps.get(id) ?? null; }
  async findProcessPolicyById(id: string) { return this.procs.get(id) ?? null; }
  async saveGlobalPolicy(p: any) { this.global = p; }
  async saveApplicationPolicy(p: any) { this.apps.set(p.id, p); }
  async saveProcessPolicy(p: any) { this.procs.set(p.id, p); }
  async deleteApplicationPolicy(id: string) { this.apps.delete(id); }
  async deleteProcessPolicy(id: string) { this.procs.delete(id); }
}

describe('PoliciesController', () => {
  describe('list', () => {
    it('returns all levels when no filter', async () => {
      const repo = new InMemoryPolicyRepo({
        global: makeGlobalPolicy(),
        apps: [makeAppPolicy()],
        procs: [makeProcPolicy()],
      });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.list({ query: {} } as any, reply as any);

      const body = reply.body as any[];
      expect(body.length).toBe(3);
      expect(body.map((p) => p.level)).toEqual(['global', 'application', 'process']);
    });

    it('filters to global level only', async () => {
      const repo = new InMemoryPolicyRepo({
        global: makeGlobalPolicy(),
        apps: [makeAppPolicy()],
        procs: [makeProcPolicy()],
      });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.list({ query: { level: 'global' } } as any, reply as any);

      const body = reply.body as any[];
      expect(body.length).toBe(1);
      expect(body[0].level).toBe('global');
    });

    it('filters to application level only', async () => {
      const repo = new InMemoryPolicyRepo({
        global: makeGlobalPolicy(),
        apps: [makeAppPolicy()],
        procs: [makeProcPolicy()],
      });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.list({ query: { level: 'application' } } as any, reply as any);

      const body = reply.body as any[];
      expect(body.length).toBe(1);
      expect(body[0].level).toBe('application');
    });

    it('filters to process level only', async () => {
      const repo = new InMemoryPolicyRepo({
        global: makeGlobalPolicy(),
        apps: [makeAppPolicy()],
        procs: [makeProcPolicy()],
      });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.list({ query: { level: 'process' } } as any, reply as any);

      const body = reply.body as any[];
      expect(body.length).toBe(1);
      expect(body[0].level).toBe('process');
    });
  });

  describe('getById', () => {
    it('returns global policy when id matches', async () => {
      const repo = new InMemoryPolicyRepo({ global: makeGlobalPolicy('g1') });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.getById({ params: { id: 'g1' } } as any, reply as any);
      expect((reply.body as any).level).toBe('global');
    });

    it('returns application policy when id matches', async () => {
      const repo = new InMemoryPolicyRepo({ apps: [makeAppPolicy('a1')] });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.getById({ params: { id: 'a1' } } as any, reply as any);
      expect((reply.body as any).level).toBe('application');
    });

    it('returns process policy when id matches', async () => {
      const repo = new InMemoryPolicyRepo({ procs: [makeProcPolicy('p1')] });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.getById({ params: { id: 'p1' } } as any, reply as any);
      expect((reply.body as any).level).toBe('process');
    });

    it('returns 404 when not found', async () => {
      const repo = new InMemoryPolicyRepo();
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.getById({ params: { id: 'missing' } } as any, reply as any);
      expect(reply.statusCode).toBe(404);
    });
  });

  describe('create', () => {
    it('creates a global policy', async () => {
      const repo = new InMemoryPolicyRepo();
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.create({
        body: { level: 'global', allowedVendors: ['openai'] },
      } as any, reply as any);
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).level).toBe('global');
    });

    it('creates an application policy', async () => {
      const repo = new InMemoryPolicyRepo();
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.create({
        body: { level: 'application', application: 'myapp' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).level).toBe('application');
      expect((reply.body as any).application).toBe('myapp');
    });

    it('creates a process policy', async () => {
      const repo = new InMemoryPolicyRepo();
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.create({
        body: { level: 'process', application: 'app', process: 'proc' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).level).toBe('process');
    });

    it('uses defaults for missing fields', async () => {
      const repo = new InMemoryPolicyRepo();
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.create({
        body: { level: 'process' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).application).toBe('unknown_application');
      expect((reply.body as any).process).toBe('unknown_process');
    });
  });

  describe('update', () => {
    it('updates a global policy', async () => {
      const repo = new InMemoryPolicyRepo({ global: makeGlobalPolicy('g1') });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.update({
        params: { id: 'g1' },
        body: { level: 'global', allowedVendors: ['anthropic'] },
      } as any, reply as any);
      expect(reply.statusCode).toBe(200);
    });

    it('updates an application policy', async () => {
      const repo = new InMemoryPolicyRepo({ apps: [makeAppPolicy('a1')] });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.update({
        params: { id: 'a1' },
        body: { level: 'application', application: 'updated_app' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(200);
      expect((reply.body as any).application).toBe('updated_app');
    });

    it('updates a process policy', async () => {
      const repo = new InMemoryPolicyRepo({ procs: [makeProcPolicy('p1')] });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.update({
        params: { id: 'p1' },
        body: { level: 'process', process: 'updated_proc' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(200);
      expect((reply.body as any).process).toBe('updated_proc');
    });

    it('returns 404 when policy not found', async () => {
      const repo = new InMemoryPolicyRepo();
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.update({
        params: { id: 'missing' },
        body: { level: 'global' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(404);
    });
  });

  describe('remove', () => {
    it('returns 404 when not found', async () => {
      const repo = new InMemoryPolicyRepo();
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.remove({ params: { id: 'missing' } } as any, reply as any);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 405 for global policy', async () => {
      const repo = new InMemoryPolicyRepo({ global: makeGlobalPolicy('g1') });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.remove({ params: { id: 'g1' } } as any, reply as any);
      expect(reply.statusCode).toBe(405);
    });

    it('deletes application policy with 204', async () => {
      const repo = new InMemoryPolicyRepo({ apps: [makeAppPolicy('a1')] });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.remove({ params: { id: 'a1' } } as any, reply as any);
      expect(reply.statusCode).toBe(204);
    });

    it('deletes process policy with 204', async () => {
      const repo = new InMemoryPolicyRepo({ procs: [makeProcPolicy('p1')] });
      const controller = new PoliciesController(repo as any);
      const reply = createReply();
      await controller.remove({ params: { id: 'p1' } } as any, reply as any);
      expect(reply.statusCode).toBe(204);
    });
  });
});
