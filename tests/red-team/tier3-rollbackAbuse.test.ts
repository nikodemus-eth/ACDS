/**
 * ARGUS-9 Tier 3 -- Rollback Abuse
 *
 * Tests that AdaptationRollbackService does not update FamilySelectionState,
 * accepts any actor, and has integrity gaps.
 * PGlite-backed: uses real PG repositories.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { AdaptationRollbackService } from '@acds/adaptive-optimizer';
import type { RollbackPreview } from '@acds/adaptive-optimizer';
import {
  makeAdaptationEvent,
  makeFamilyState,
  makeCandidateState,
  makeRankedCandidate,
  getRedTeamPool,
  truncateRedTeamTables,
  teardownRedTeamPool,
  createPgAdaptationLedger,
  createPgOptimizerStateRepository,
  createPgRollbackRecordWriter,
  CollectingRollbackAuditEmitter,
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
  const ledger = createPgAdaptationLedger(pool);
  const optimizerRepo = createPgOptimizerStateRepository(pool);
  const rollbackWriter = createPgRollbackRecordWriter(pool);
  const emitter = new CollectingRollbackAuditEmitter();
  const service = new AdaptationRollbackService(ledger, optimizerRepo, rollbackWriter, emitter);
  return { ledger, optimizerRepo, rollbackWriter, emitter, service };
}

async function seedFamily(
  ctx: ReturnType<typeof createService>,
  familyKey: string,
  eventId: string,
  eventCreatedAt?: string,
) {
  const event = makeAdaptationEvent({
    id: eventId,
    familyKey,
    createdAt: eventCreatedAt ?? new Date().toISOString(),
    previousRanking: [makeRankedCandidate({ rank: 1, candidate: makeCandidateState({ candidateId: 'old:cand:1', familyKey }) })],
    newRanking: [makeRankedCandidate({ rank: 1, candidate: makeCandidateState({ candidateId: 'new:cand:1', familyKey }) })],
  });
  await ctx.ledger.writeEvent(event);
  await ctx.optimizerRepo.saveFamilyState(makeFamilyState({ familyKey }));
  await ctx.optimizerRepo.saveCandidateState(
    makeCandidateState({ familyKey, candidateId: 'new:cand:1' }),
  );
  return event;
}

describe('ARGUS G4-G6: Rollback Abuse', () => {

  it('updates FamilySelectionState on rollback execution after hardening', async () => {
    const ctx = createService();
    const fk = 'app:proc:step';
    await seedFamily(ctx, fk, 'evt-1');

    const stateBefore = await ctx.optimizerRepo.getFamilyState(fk);
    await ctx.service.executeRollback(fk, 'evt-1', 'operator', 'test rollback');
    const stateAfter = await ctx.optimizerRepo.getFamilyState(fk);

    expect(stateAfter).not.toEqual(stateBefore);
  });

  it('rejects empty actor and reason after hardening', async () => {
    const ctx = createService();
    await seedFamily(ctx, 'app:proc:step', 'evt-1');

    await expect(
      ctx.service.executeRollback('app:proc:step', 'evt-1', '', '')
    ).rejects.toThrow();
  });

  it('does not prevent multiple rollbacks to same event', async () => {
    const ctx = createService();
    await seedFamily(ctx, 'app:proc:step', 'evt-1');

    await ctx.service.executeRollback('app:proc:step', 'evt-1', 'op1', 'first');
    await ctx.service.executeRollback('app:proc:step', 'evt-1', 'op2', 'second');

    const result = await pool.query('SELECT count(*) FROM adaptation_rollback_records WHERE family_key = $1', ['app:proc:step']);
    expect(Number(result.rows[0].count)).toBe(2);
  });

  it('blocks rollback for events older than 7 days', async () => {
    const ctx = createService();
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await seedFamily(ctx, 'app:proc:step', 'evt-old', oldDate);

    await expect(
      ctx.service.executeRollback('app:proc:step', 'evt-old', 'op', 'reason')
    ).rejects.toThrow('not safe');
  });

  it('permits rollback for event at 6.99 days without policy revalidation', async () => {
    const ctx = createService();
    const almostOld = new Date(Date.now() - 6.99 * 24 * 60 * 60 * 1000).toISOString();
    await seedFamily(ctx, 'app:proc:step', 'evt-almost', almostOld);

    const record = await ctx.service.executeRollback('app:proc:step', 'evt-almost', 'op', 'reason');
    expect(record).toBeDefined();
  });

  it('generates preview with empty actor and reason', async () => {
    const ctx = createService();
    await seedFamily(ctx, 'app:proc:step', 'evt-1');

    const preview: RollbackPreview = await ctx.service.previewRollback('app:proc:step', 'evt-1');
    expect(preview.preview.actor).toBe('');
    expect(preview.preview.reason).toBe('');
  });

  it('throws when target event belongs to different family', async () => {
    const ctx = createService();
    await seedFamily(ctx, 'app:proc:step', 'evt-1');
    await ctx.optimizerRepo.saveFamilyState(makeFamilyState({ familyKey: 'other:family:key' }));

    await expect(
      ctx.service.executeRollback('other:family:key', 'evt-1', 'op', 'reason')
    ).rejects.toThrow('belongs to family');
  });

  it('throws when event not found', async () => {
    const ctx = createService();
    await ctx.optimizerRepo.saveFamilyState(makeFamilyState({ familyKey: 'fam' }));

    await expect(
      ctx.service.executeRollback('fam', 'nonexistent', 'op', 'reason')
    ).rejects.toThrow('not found');
  });
});
