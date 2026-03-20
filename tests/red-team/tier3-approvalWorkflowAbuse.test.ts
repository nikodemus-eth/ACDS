/**
 * ARGUS-9 Tier 3 -- Approval Workflow Abuse
 *
 * Tests the AdaptationApprovalService state machine for authorization,
 * timing, and deduplication behavior.
 * PGlite-backed: uses real PG repositories.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { AdaptationApprovalService } from '@acds/adaptive-optimizer';
import {
  makeRecommendation,
  getRedTeamPool,
  truncateRedTeamTables,
  teardownRedTeamPool,
  createPgApprovalRepository,
  CollectingApprovalAuditEmitter,
} from './_fixtures.js';
import type { PoolLike } from '../__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await getRedTeamPool();
});

beforeEach(async () => {
  await truncateRedTeamTables();
});

afterAll(async () => {
  await teardownRedTeamPool();
});

function createService() {
  const repo = createPgApprovalRepository(pool);
  const emitter = new CollectingApprovalAuditEmitter();
  const service = new AdaptationApprovalService(repo, emitter);
  return { repo, emitter, service };
}

describe('ARGUS G1-G3: Approval Workflow Abuse', () => {

  it('rejects maxAgeMs: 0 after hardening', async () => {
    const { service } = createService();
    await expect(service.submitForApproval(makeRecommendation(), 0)).rejects.toThrow();
  });

  it('rejects maxAgeMs: -1 after hardening', async () => {
    const { service } = createService();
    await expect(service.submitForApproval(makeRecommendation(), -1)).rejects.toThrow();
  });

  it('rejects duplicate submissions for same recommendation after hardening', async () => {
    const { service } = createService();
    const rec = makeRecommendation({ id: 'rec-dup' });

    await service.submitForApproval(rec);
    await expect(service.submitForApproval(rec)).rejects.toThrow();
  });

  it('correctly handles maxAge=0 in expireStale after hardening', async () => {
    const { service } = createService();

    await service.submitForApproval(makeRecommendation({ id: 'r1' }));
    await service.submitForApproval(makeRecommendation({ id: 'r2' }));
    const count = await service.expireStale(0);
    expect(count).toBe(2);
  });

  it('permits expireStale(1) to expire ALL pending approvals after 1ms', async () => {
    const { repo, service } = createService();

    await service.submitForApproval(makeRecommendation({ id: 'r1' }));
    await service.submitForApproval(makeRecommendation({ id: 'r2' }));
    await new Promise(r => setTimeout(r, 5));
    const count = await service.expireStale(1);
    expect(count).toBe(2);

    const pending = await repo.findPending();
    expect(pending.length).toBe(0);
  });

  it('permits any non-empty string as actor in approve -- no authorization', () => {
    const { service } = createService();

    return service.submitForApproval(makeRecommendation()).then((approval) =>
      service.approve(approval.id, 'random-stranger', 'because I can').then((updated) => {
        expect(updated.status).toBe('approved');
        expect(updated.decidedBy).toBe('random-stranger');
      })
    );
  });

  it('rejects empty string as actor in approve after hardening', async () => {
    const { service } = createService();

    const approval = await service.submitForApproval(makeRecommendation());
    await expect(service.approve(approval.id, '')).rejects.toThrow();
  });

  it('throws on approve of already-approved record', () => {
    const { service } = createService();

    return service.submitForApproval(makeRecommendation()).then((approval) =>
      service.approve(approval.id, 'actor').then(() =>
        expect(service.approve(approval.id, 'actor')).rejects.toThrow('cannot be modified')
      )
    );
  });

  it('never transitions to superseded status via public API', async () => {
    const { repo, service } = createService();

    await service.submitForApproval(makeRecommendation({ id: 'r1' }));
    const pending = await repo.findPending();
    expect(pending[0].status).toBe('pending');
  });

  it('does not auto-apply approved recommendations -- gap between approval and action', () => {
    const { service } = createService();

    return service.submitForApproval(makeRecommendation()).then((approval) =>
      service.approve(approval.id, 'operator', 'looks good').then((updated) => {
        expect(updated.status).toBe('approved');
      })
    );
  });
});
