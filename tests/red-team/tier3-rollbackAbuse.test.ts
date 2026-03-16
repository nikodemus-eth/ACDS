/**
 * ARGUS-9 Tier 3 — Rollback Abuse
 *
 * Tests that AdaptationRollbackService does not update FamilySelectionState,
 * accepts any actor, and has integrity gaps.
 */

import { describe, it, expect } from 'vitest';
import { AdaptationRollbackService } from '@acds/adaptive-optimizer';
import type { RollbackPreview } from '@acds/adaptive-optimizer';
import {
  makeAdaptationEvent,
  makeFamilyState,
  makeCandidateState,
  makeRankedCandidate,
  InMemoryAdaptationLedger,
  InMemoryOptimizerStateRepository,
  InMemoryRollbackRecordWriter,
  CollectingRollbackAuditEmitter,
} from './_fixtures.js';

function createService() {
  const ledger = new InMemoryAdaptationLedger();
  const optimizerRepo = new InMemoryOptimizerStateRepository();
  const rollbackWriter = new InMemoryRollbackRecordWriter();
  const emitter = new CollectingRollbackAuditEmitter();
  const service = new AdaptationRollbackService(ledger, optimizerRepo, rollbackWriter, emitter);
  return { ledger, optimizerRepo, rollbackWriter, emitter, service };
}

function seedFamily(
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
  ctx.ledger.events.push(event);
  ctx.optimizerRepo.familyStates.set(familyKey, makeFamilyState({ familyKey }));
  ctx.optimizerRepo.candidateStates.set(familyKey, [
    makeCandidateState({ familyKey, candidateId: 'new:cand:1' }),
  ]);
  return event;
}

describe('ARGUS G4-G6: Rollback Abuse', () => {

  it('updates FamilySelectionState on rollback execution after hardening', async () => {
    // FIXED: Previously only persisted record and emitted audit without mutating state.
    // Now restores optimizer state from the adaptation event's previousRanking.
    const ctx = createService();
    const fk = 'app:proc:step';
    seedFamily(ctx, fk, 'evt-1');

    const stateBefore = await ctx.optimizerRepo.getFamilyState(fk);
    await ctx.service.executeRollback(fk, 'evt-1', 'operator', 'test rollback');
    const stateAfter = await ctx.optimizerRepo.getFamilyState(fk);

    // Family state is now updated by rollback
    expect(stateAfter).not.toEqual(stateBefore);
  });

  it('rejects empty actor and reason after hardening', async () => {
    // FIXED: Previously accepted empty strings for actor/reason, now validates non-empty
    const ctx = createService();
    seedFamily(ctx, 'app:proc:step', 'evt-1');

    await expect(
      ctx.service.executeRollback('app:proc:step', 'evt-1', '', '')
    ).rejects.toThrow();
  });

  it('does not prevent multiple rollbacks to same event', async () => {
    // VULN: no deduplication — same event can be rolled back multiple times
    const ctx = createService();
    seedFamily(ctx, 'app:proc:step', 'evt-1');

    await ctx.service.executeRollback('app:proc:step', 'evt-1', 'op1', 'first');
    await ctx.service.executeRollback('app:proc:step', 'evt-1', 'op2', 'second');

    expect(ctx.rollbackWriter.records).toHaveLength(2);
  });

  it('blocks rollback for events older than 7 days', async () => {
    // Verifies age check — but just barely inside 7 days passes
    const ctx = createService();
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    seedFamily(ctx, 'app:proc:step', 'evt-old', oldDate);

    await expect(
      ctx.service.executeRollback('app:proc:step', 'evt-old', 'op', 'reason')
    ).rejects.toThrow('not safe');
  });

  it('permits rollback for event at 6.99 days without policy revalidation', async () => {
    // VULN: 6.99-day-old events pass age check; no revalidation of whether
    // the restored state is still policy-compliant
    const ctx = createService();
    const almostOld = new Date(Date.now() - 6.99 * 24 * 60 * 60 * 1000).toISOString();
    seedFamily(ctx, 'app:proc:step', 'evt-almost', almostOld);

    const record = await ctx.service.executeRollback('app:proc:step', 'evt-almost', 'op', 'reason');
    expect(record).toBeDefined();
  });

  it('generates preview with empty actor and reason', async () => {
    // VULN: preview record has actor='' and reason='' — no attribution
    const ctx = createService();
    seedFamily(ctx, 'app:proc:step', 'evt-1');

    const preview: RollbackPreview = await ctx.service.previewRollback('app:proc:step', 'evt-1');
    expect(preview.preview.actor).toBe('');
    expect(preview.preview.reason).toBe('');
  });

  it('throws when target event belongs to different family', async () => {
    // Verifies cross-family protection
    const ctx = createService();
    seedFamily(ctx, 'app:proc:step', 'evt-1');
    ctx.optimizerRepo.familyStates.set('other:family:key', makeFamilyState({ familyKey: 'other:family:key' }));

    await expect(
      ctx.service.executeRollback('other:family:key', 'evt-1', 'op', 'reason')
    ).rejects.toThrow('belongs to family');
  });

  it('throws when event not found', async () => {
    const ctx = createService();
    ctx.optimizerRepo.familyStates.set('fam', makeFamilyState({ familyKey: 'fam' }));

    await expect(
      ctx.service.executeRollback('fam', 'nonexistent', 'op', 'reason')
    ).rejects.toThrow('not found');
  });
});
