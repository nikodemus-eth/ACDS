import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PoliciesController } from './PoliciesController.js';
import { PgPolicyRepository } from '@acds/persistence-pg';
import { createTestPool, runMigrations, truncateAll, closePool, type PoolLike } from '../../../../tests/__test-support__/pglitePool.js';

// -- PGlite lifecycle --------------------------------------------------------

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

// -- Helpers -----------------------------------------------------------------

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

function createRepo(): PgPolicyRepository {
  return new PgPolicyRepository(pool as any);
}

const now = new Date('2026-03-15T10:00:00Z');

const GLOBAL_ID   = '00000000-0000-0000-0000-000000000001';
const APP_ID      = '00000000-0000-0000-0000-000000000002';
const PROC_ID     = '00000000-0000-0000-0000-000000000003';
const MISSING_ID  = '00000000-0000-0000-0000-00000000ffff';

function makeGlobalPolicy(id = GLOBAL_ID) {
  return {
    id,
    allowedVendors: ['openai'] as any[],
    blockedVendors: [] as any[],
    defaultPrivacy: 'cloud_allowed' as const,
    defaultCostSensitivity: 'medium' as const,
    structuredOutputRequiredForGrades: [] as any[],
    traceabilityRequiredForGrades: [] as any[],
    maxLatencyMsByLoadTier: {} as Record<string, any>,
    localPreferredTaskTypes: [] as any[],
    cloudRequiredLoadTiers: [] as any[],
    enabled: true,
    updatedAt: now,
  };
}

function makeAppPolicy(id = APP_ID) {
  return {
    id,
    application: 'test_app',
    allowedVendors: ['openai'] as any[] | null,
    blockedVendors: null as any[] | null,
    privacyOverride: null as any,
    costSensitivityOverride: null as any,
    preferredModelProfileIds: null as any[] | null,
    blockedModelProfileIds: null as any[] | null,
    localPreferredTaskTypes: null as any[] | null,
    structuredOutputRequiredForGrades: null as any[] | null,
    enabled: true,
    updatedAt: now,
  };
}

function makeProcPolicy(id = PROC_ID) {
  return {
    id,
    application: 'test_app',
    process: 'review',
    step: null as string | null,
    defaultModelProfileId: null as string | null,
    defaultTacticProfileId: null as string | null,
    allowedModelProfileIds: null as any[] | null,
    blockedModelProfileIds: null as any[] | null,
    allowedTacticProfileIds: null as any[] | null,
    privacyOverride: null as any,
    costSensitivityOverride: null as any,
    forceEscalationForGrades: null as any[] | null,
    enabled: true,
    updatedAt: now,
  };
}

// -- Tests -------------------------------------------------------------------

describe('PoliciesController', () => {
  describe('list', () => {
    it('returns all levels when no filter', async () => {
      const repo = createRepo();
      await repo.saveGlobalPolicy(makeGlobalPolicy());
      await repo.saveApplicationPolicy(makeAppPolicy());
      await repo.saveProcessPolicy(makeProcPolicy());
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.list({ query: {} } as any, reply as any);

      const body = reply.body as any[];
      expect(body.length).toBe(3);
      expect(body.map((p) => p.level)).toEqual(['global', 'application', 'process']);
    });

    it('filters to global level only', async () => {
      const repo = createRepo();
      await repo.saveGlobalPolicy(makeGlobalPolicy());
      await repo.saveApplicationPolicy(makeAppPolicy());
      await repo.saveProcessPolicy(makeProcPolicy());
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.list({ query: { level: 'global' } } as any, reply as any);

      const body = reply.body as any[];
      expect(body.length).toBe(1);
      expect(body[0].level).toBe('global');
    });

    it('filters to application level only', async () => {
      const repo = createRepo();
      await repo.saveGlobalPolicy(makeGlobalPolicy());
      await repo.saveApplicationPolicy(makeAppPolicy());
      await repo.saveProcessPolicy(makeProcPolicy());
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.list({ query: { level: 'application' } } as any, reply as any);

      const body = reply.body as any[];
      expect(body.length).toBe(1);
      expect(body[0].level).toBe('application');
    });

    it('filters to process level only', async () => {
      const repo = createRepo();
      await repo.saveGlobalPolicy(makeGlobalPolicy());
      await repo.saveApplicationPolicy(makeAppPolicy());
      await repo.saveProcessPolicy(makeProcPolicy());
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.list({ query: { level: 'process' } } as any, reply as any);

      const body = reply.body as any[];
      expect(body.length).toBe(1);
      expect(body[0].level).toBe('process');
    });
  });

  describe('getById', () => {
    it('returns global policy when id matches', async () => {
      const repo = createRepo();
      await repo.saveGlobalPolicy(makeGlobalPolicy(GLOBAL_ID));
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.getById({ params: { id: GLOBAL_ID } } as any, reply as any);
      expect((reply.body as any).level).toBe('global');
    });

    it('returns application policy when id matches', async () => {
      const repo = createRepo();
      await repo.saveApplicationPolicy(makeAppPolicy(APP_ID));
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.getById({ params: { id: APP_ID } } as any, reply as any);
      expect((reply.body as any).level).toBe('application');
    });

    it('returns process policy when id matches', async () => {
      const repo = createRepo();
      await repo.saveProcessPolicy(makeProcPolicy(PROC_ID));
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.getById({ params: { id: PROC_ID } } as any, reply as any);
      expect((reply.body as any).level).toBe('process');
    });

    it('returns 404 when not found', async () => {
      const repo = createRepo();
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.getById({ params: { id: MISSING_ID } } as any, reply as any);
      expect(reply.statusCode).toBe(404);
    });
  });

  describe('create', () => {
    it('creates a global policy', async () => {
      const repo = createRepo();
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.create({
        body: { level: 'global', allowedVendors: ['openai'] },
      } as any, reply as any);
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).level).toBe('global');
    });

    it('creates an application policy', async () => {
      const repo = createRepo();
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.create({
        body: { level: 'application', application: 'myapp' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).level).toBe('application');
      expect((reply.body as any).application).toBe('myapp');
    });

    it('creates a process policy', async () => {
      const repo = createRepo();
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.create({
        body: { level: 'process', application: 'app', process: 'proc' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(201);
      expect((reply.body as any).level).toBe('process');
    });

    it('uses defaults for missing fields', async () => {
      const repo = createRepo();
      const controller = new PoliciesController(repo);
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
      const repo = createRepo();
      await repo.saveGlobalPolicy(makeGlobalPolicy(GLOBAL_ID));
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.update({
        params: { id: GLOBAL_ID },
        body: { level: 'global', allowedVendors: ['anthropic'] },
      } as any, reply as any);
      expect(reply.statusCode).toBe(200);
    });

    it('updates an application policy', async () => {
      const repo = createRepo();
      await repo.saveApplicationPolicy(makeAppPolicy(APP_ID));
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.update({
        params: { id: APP_ID },
        body: { level: 'application', application: 'updated_app' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(200);
      expect((reply.body as any).application).toBe('updated_app');
    });

    it('updates a process policy', async () => {
      const repo = createRepo();
      await repo.saveProcessPolicy(makeProcPolicy(PROC_ID));
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.update({
        params: { id: PROC_ID },
        body: { level: 'process', process: 'updated_proc' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(200);
      expect((reply.body as any).process).toBe('updated_proc');
    });

    it('returns 404 when policy not found', async () => {
      const repo = createRepo();
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.update({
        params: { id: MISSING_ID },
        body: { level: 'global' },
      } as any, reply as any);
      expect(reply.statusCode).toBe(404);
    });
  });

  describe('remove', () => {
    it('returns 404 when not found', async () => {
      const repo = createRepo();
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.remove({ params: { id: MISSING_ID } } as any, reply as any);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 405 for global policy', async () => {
      const repo = createRepo();
      await repo.saveGlobalPolicy(makeGlobalPolicy(GLOBAL_ID));
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.remove({ params: { id: GLOBAL_ID } } as any, reply as any);
      expect(reply.statusCode).toBe(405);
    });

    it('deletes application policy with 204', async () => {
      const repo = createRepo();
      await repo.saveApplicationPolicy(makeAppPolicy(APP_ID));
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.remove({ params: { id: APP_ID } } as any, reply as any);
      expect(reply.statusCode).toBe(204);
    });

    it('deletes process policy with 204', async () => {
      const repo = createRepo();
      await repo.saveProcessPolicy(makeProcPolicy(PROC_ID));
      const controller = new PoliciesController(repo);
      const reply = createReply();
      await controller.remove({ params: { id: PROC_ID } } as any, reply as any);
      expect(reply.statusCode).toBe(204);
    });
  });
});
