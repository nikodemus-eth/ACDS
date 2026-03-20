// Integration Tests – PgAuditEventRepository (PGlite, no mocks)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgAuditEventRepository } from './PgAuditEventRepository.js';
import {
  createTestPool, runMigrations, truncateAll, closePool, type PoolLike,
} from '../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});
afterAll(async () => { await closePool(); });
beforeEach(async () => { await truncateAll(pool); });

async function insertAuditEvent(pool: PoolLike, overrides: Record<string, unknown> = {}) {
  const defaults = {
    event_type: 'policy_change', actor: 'admin-user', action: 'update',
    resource_type: 'policy', resource_id: 'pol-001', application: 'test-app',
    details: JSON.stringify({ key: 'value' }), created_at: '2026-03-16T12:00:00Z',
  };
  const row = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO audit_events (event_type, actor, action, resource_type, resource_id, application, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [row.event_type, row.actor, row.action, row.resource_type, row.resource_id, row.application, row.details, row.created_at],
  );
  return result.rows[0].id as string;
}

describe('PgAuditEventRepository', () => {
  let repo: PgAuditEventRepository;
  beforeEach(() => { repo = new PgAuditEventRepository(pool as any); });

  describe('findById()', () => {
    it('returns event by id', async () => {
      const id = await insertAuditEvent(pool);
      const result = await repo.findById(id);
      expect(result).not.toBeNull();
      expect(result!.eventType).toBe('policy_change');
      expect(result!.actor).toBe('admin-user');
    });

    it('returns null for nonexistent', async () => {
      expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });

  describe('find()', () => {
    it('returns all without filters', async () => {
      await insertAuditEvent(pool);
      await insertAuditEvent(pool, { event_type: 'adaptation_applied' });
      expect(await repo.find({})).toHaveLength(2);
    });

    it('filters by eventType', async () => {
      await insertAuditEvent(pool, { event_type: 'policy_change' });
      await insertAuditEvent(pool, { event_type: 'adaptation_applied' });
      const results = await repo.find({ eventType: 'policy_change' as any });
      expect(results).toHaveLength(1);
    });

    it('filters by actor', async () => {
      await insertAuditEvent(pool, { actor: 'alice' });
      await insertAuditEvent(pool, { actor: 'bob' });
      expect(await repo.find({ actor: 'alice' })).toHaveLength(1);
    });

    it('filters by resourceType', async () => {
      await insertAuditEvent(pool, { resource_type: 'policy' });
      await insertAuditEvent(pool, { resource_type: 'provider' });
      expect(await repo.find({ resourceType: 'policy' })).toHaveLength(1);
    });

    it('filters by resourceId', async () => {
      await insertAuditEvent(pool, { resource_id: 'r1' });
      await insertAuditEvent(pool, { resource_id: 'r2' });
      expect(await repo.find({ resourceId: 'r1' })).toHaveLength(1);
    });

    it('filters by application', async () => {
      await insertAuditEvent(pool, { application: 'a' });
      await insertAuditEvent(pool, { application: 'b' });
      expect(await repo.find({ application: 'a' })).toHaveLength(1);
    });

    it('filters by dateFrom and dateTo', async () => {
      await insertAuditEvent(pool, { created_at: '2026-03-14T00:00:00Z' });
      await insertAuditEvent(pool, { created_at: '2026-03-15T12:00:00Z' });
      await insertAuditEvent(pool, { created_at: '2026-03-17T00:00:00Z' });
      const results = await repo.find({
        dateFrom: new Date('2026-03-15T00:00:00Z'), dateTo: new Date('2026-03-16T00:00:00Z'),
      });
      expect(results).toHaveLength(1);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) await insertAuditEvent(pool);
      expect(await repo.find({ limit: 2 })).toHaveLength(2);
    });

    it('respects offset', async () => {
      for (let i = 0; i < 5; i++) await insertAuditEvent(pool);
      const all = await repo.find({});
      const offset = await repo.find({ offset: 2 });
      expect(offset).toHaveLength(3);
      expect(offset[0].id).toBe(all[2].id);
    });
  });
});
