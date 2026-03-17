// ---------------------------------------------------------------------------
// Integration Tests – PgAuditEventRepository (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgAuditEventRepository } from '@acds/persistence-pg';
import {
  createTestPool,
  runMigrations,
  truncateAll,
  closePool,
  type PoolLike,
} from '../../__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

afterAll(async () => {
  await closePool();
});

beforeEach(async () => {
  await truncateAll(pool);
});

/** Insert an audit event directly via SQL (the repo has no write method — it's read-only). */
async function insertAuditEvent(
  pool: PoolLike,
  overrides: Record<string, unknown> = {},
) {
  const defaults = {
    event_type: 'policy_change',
    actor: 'admin-user',
    action: 'update',
    resource_type: 'policy',
    resource_id: 'pol-001',
    application: 'test-app',
    details: JSON.stringify({ key: 'value' }),
    created_at: '2026-03-16T12:00:00Z',
  };

  const row = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO audit_events
       (event_type, actor, action, resource_type, resource_id, application, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      row.event_type,
      row.actor,
      row.action,
      row.resource_type,
      row.resource_id,
      row.application,
      row.details,
      row.created_at,
    ],
  );

  return result.rows[0].id as string;
}

describe('PgAuditEventRepository', () => {
  let repo: PgAuditEventRepository;

  beforeEach(() => {
    repo = new PgAuditEventRepository(pool as any);
  });

  // ── findById() ────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('returns an audit event by id with correct field mapping', async () => {
      const id = await insertAuditEvent(pool);

      const result = await repo.findById(id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(id);
      expect(result!.eventType).toBe('policy_change');
      expect(result!.actor).toBe('admin-user');
      expect(result!.action).toBe('update');
      expect(result!.resourceType).toBe('policy');
      expect(result!.resourceId).toBe('pol-001');
      expect(result!.application).toBe('test-app');
      expect(result!.details).toEqual({ key: 'value' });
      expect(result!.timestamp).toBeDefined();
    });

    it('returns null for a nonexistent id', async () => {
      const result = await repo.findById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });
  });

  // ── find() ────────────────────────────────────────────────────────────────

  describe('find()', () => {
    it('returns all events without filters', async () => {
      await insertAuditEvent(pool, { event_type: 'policy_change' });
      await insertAuditEvent(pool, { event_type: 'adaptation_applied' });

      const results = await repo.find({});
      expect(results).toHaveLength(2);
    });

    it('filters by eventType', async () => {
      await insertAuditEvent(pool, { event_type: 'policy_change' });
      await insertAuditEvent(pool, { event_type: 'adaptation_applied' });

      const results = await repo.find({ eventType: 'policy_change' as any });
      expect(results).toHaveLength(1);
      expect(results[0].eventType).toBe('policy_change');
    });

    it('filters by actor', async () => {
      await insertAuditEvent(pool, { actor: 'alice' });
      await insertAuditEvent(pool, { actor: 'bob' });

      const results = await repo.find({ actor: 'alice' });
      expect(results).toHaveLength(1);
      expect(results[0].actor).toBe('alice');
    });

    it('filters by resourceType', async () => {
      await insertAuditEvent(pool, { resource_type: 'policy' });
      await insertAuditEvent(pool, { resource_type: 'provider' });

      const results = await repo.find({ resourceType: 'policy' });
      expect(results).toHaveLength(1);
      expect(results[0].resourceType).toBe('policy');
    });

    it('filters by resourceId', async () => {
      await insertAuditEvent(pool, { resource_id: 'res-1' });
      await insertAuditEvent(pool, { resource_id: 'res-2' });

      const results = await repo.find({ resourceId: 'res-1' });
      expect(results).toHaveLength(1);
      expect(results[0].resourceId).toBe('res-1');
    });

    it('filters by application', async () => {
      await insertAuditEvent(pool, { application: 'app-a' });
      await insertAuditEvent(pool, { application: 'app-b' });

      const results = await repo.find({ application: 'app-a' });
      expect(results).toHaveLength(1);
      expect(results[0].application).toBe('app-a');
    });

    it('filters by dateFrom and dateTo', async () => {
      await insertAuditEvent(pool, { created_at: '2026-03-14T00:00:00Z' });
      await insertAuditEvent(pool, { created_at: '2026-03-15T12:00:00Z' });
      await insertAuditEvent(pool, { created_at: '2026-03-17T00:00:00Z' });

      const results = await repo.find({
        dateFrom: new Date('2026-03-15T00:00:00Z'),
        dateTo: new Date('2026-03-16T00:00:00Z'),
      });
      expect(results).toHaveLength(1);
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await insertAuditEvent(pool);
      }

      const results = await repo.find({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('respects the offset parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await insertAuditEvent(pool, { created_at: `2026-03-1${i + 1}T00:00:00Z` });
      }

      const all = await repo.find({});
      const offset = await repo.find({ offset: 2 });
      expect(offset).toHaveLength(3);
      expect(offset[0].id).toBe(all[2].id);
    });

    it('combines multiple filters', async () => {
      await insertAuditEvent(pool, { actor: 'alice', event_type: 'policy_change' });
      await insertAuditEvent(pool, { actor: 'alice', event_type: 'adaptation_applied' });
      await insertAuditEvent(pool, { actor: 'bob', event_type: 'policy_change' });

      const results = await repo.find({
        actor: 'alice',
        eventType: 'policy_change' as any,
      });
      expect(results).toHaveLength(1);
    });

    it('returns events ordered by created_at DESC', async () => {
      const id1 = await insertAuditEvent(pool, { created_at: '2026-03-14T00:00:00Z' });
      const id2 = await insertAuditEvent(pool, { created_at: '2026-03-16T00:00:00Z' });

      const results = await repo.find({});
      expect(results[0].id).toBe(id2);
      expect(results[1].id).toBe(id1);
    });
  });
});
