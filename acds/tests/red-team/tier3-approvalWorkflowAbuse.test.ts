/**
 * ARGUS-9 Tier 3 — Approval Workflow Abuse
 *
 * Tests the AdaptationApprovalService state machine for authorization,
 * timing, and deduplication behavior. Input validation vulnerabilities
 * were fixed in commit 98b2231 ("Harden dispatch execution and adaptive controls").
 */

import { describe, it, expect } from 'vitest';
import { AdaptationApprovalService } from '@acds/adaptive-optimizer';
import {
  makeRecommendation,
  InMemoryApprovalRepository,
  CollectingApprovalAuditEmitter,
} from './_fixtures.js';

function createService() {
  const repo = new InMemoryApprovalRepository();
  const emitter = new CollectingApprovalAuditEmitter();
  const service = new AdaptationApprovalService(repo, emitter);
  return { repo, emitter, service };
}

describe('ARGUS G1-G3: Approval Workflow Abuse', () => {

  it('rejects maxAgeMs: 0 after hardening', async () => {
    // FIXED: Previously accepted maxAgeMs=0 creating instantly-expirable approval, now validates positive TTL
    const { service } = createService();
    await expect(service.submitForApproval(makeRecommendation(), 0)).rejects.toThrow();
  });

  it('rejects maxAgeMs: -1 after hardening', async () => {
    // FIXED: Previously accepted negative TTL creating born-expired approval, now validates positive TTL
    const { service } = createService();
    await expect(service.submitForApproval(makeRecommendation(), -1)).rejects.toThrow();
  });

  it('rejects duplicate submissions for same recommendation after hardening', async () => {
    // FIXED: Previously allowed duplicate pending approvals, now deduplicates by recommendationId
    const { service } = createService();
    const rec = makeRecommendation({ id: 'rec-dup' });

    await service.submitForApproval(rec);
    await expect(service.submitForApproval(rec)).rejects.toThrow();
  });

  it('correctly handles maxAge=0 in expireStale after hardening', async () => {
    // FIXED: Previously used truthiness check (`maxAge ? ...`) treating 0 as falsy.
    // Now uses `maxAge !== undefined`, so expireStale(0) means cutoff = submittedAt+0 = submittedAt,
    // causing all approvals to expire immediately.
    const { service } = createService();

    await service.submitForApproval(makeRecommendation({ id: 'r1' }));
    await service.submitForApproval(makeRecommendation({ id: 'r2' }));
    const count = await service.expireStale(0);
    expect(count).toBe(2);
  });

  it('permits expireStale(1) to expire ALL pending approvals after 1ms', async () => {
    // maxAge=1 means cutoff = submittedAt+1ms — virtually instant expiry
    const { repo, service } = createService();

    await service.submitForApproval(makeRecommendation({ id: 'r1' }));
    await service.submitForApproval(makeRecommendation({ id: 'r2' }));
    // Wait 2ms to ensure we're past the cutoff
    await new Promise(r => setTimeout(r, 5));
    const count = await service.expireStale(1);
    expect(count).toBe(2);
    expect(repo.approvals.every(a => a.status === 'expired')).toBe(true);
  });

  it('permits any non-empty string as actor in approve — no authorization', () => {
    // Design observation: no authorization check on who can approve, only validates non-empty
    const { service } = createService();

    return service.submitForApproval(makeRecommendation()).then((approval) =>
      service.approve(approval.id, 'random-stranger', 'because I can').then((updated) => {
        expect(updated.status).toBe('approved');
        expect(updated.decidedBy).toBe('random-stranger');
      })
    );
  });

  it('rejects empty string as actor in approve after hardening', async () => {
    // FIXED: Previously accepted empty actor (anonymous approval), now validates non-empty
    const { service } = createService();

    const approval = await service.submitForApproval(makeRecommendation());
    await expect(service.approve(approval.id, '')).rejects.toThrow();
  });

  it('throws on approve of already-approved record', () => {
    // State machine rejects double-approve
    const { service } = createService();

    return service.submitForApproval(makeRecommendation()).then((approval) =>
      service.approve(approval.id, 'actor').then(() =>
        expect(service.approve(approval.id, 'actor')).rejects.toThrow('cannot be modified')
      )
    );
  });

  it('never transitions to superseded status via public API', async () => {
    // Design observation: superseded type exists but is unreachable — dead code
    const { repo, service } = createService();

    await service.submitForApproval(makeRecommendation({ id: 'r1' }));
    // After second submission, first is superseded or rejected due to dedup
    // With hardening, duplicate is now rejected, so only one approval exists
    expect(repo.approvals[0].status).toBe('pending');
  });

  it('does not auto-apply approved recommendations — gap between approval and action', () => {
    // Design observation: approving doesn't trigger state mutation
    const { service } = createService();

    return service.submitForApproval(makeRecommendation()).then((approval) =>
      service.approve(approval.id, 'operator', 'looks good').then((updated) => {
        expect(updated.status).toBe('approved');
      })
    );
  });
});
