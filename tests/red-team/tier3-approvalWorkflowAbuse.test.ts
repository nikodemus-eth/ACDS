/**
 * ARGUS-9 Tier 3 — Approval Workflow Abuse
 *
 * Tests that the AdaptationApprovalService state machine has
 * unreachable states, missing authorization, and timing vulnerabilities.
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

  it('permits maxAgeMs: 0 creating instantly-expirable approval', () => {
    // VULN: maxAgeMs=0 means expiresAt === submittedAt — born expired
    const { service } = createService();
    return service.submitForApproval(makeRecommendation(), 0).then((approval) => {
      const submitted = new Date(approval.submittedAt).getTime();
      const expires = new Date(approval.expiresAt).getTime();
      expect(expires).toBe(submitted);
    });
  });

  it('permits maxAgeMs: -1 creating born-expired approval', () => {
    // VULN: negative TTL means expiresAt < submittedAt
    const { service } = createService();
    return service.submitForApproval(makeRecommendation(), -1).then((approval) => {
      const submitted = new Date(approval.submittedAt).getTime();
      const expires = new Date(approval.expiresAt).getTime();
      expect(expires).toBeLessThan(submitted);
    });
  });

  it('permits duplicate submissions for same recommendation', () => {
    // VULN: no deduplication — same recommendation creates multiple pending approvals
    const { repo, service } = createService();
    const rec = makeRecommendation({ id: 'rec-dup' });

    return service.submitForApproval(rec).then(() =>
      service.submitForApproval(rec).then(() => {
        expect(repo.approvals).toHaveLength(2);
        expect(repo.approvals.every(a => a.status === 'pending')).toBe(true);
      })
    );
  });

  it('ignores maxAge=0 due to truthiness check — treats 0 as "not provided"', async () => {
    // VULN: `maxAge ? ... : ...` treats 0 as falsy, falling through to expiresAt
    // This means expireStale(0) behaves identically to expireStale() — not "expire immediately"
    const { service } = createService();

    await service.submitForApproval(makeRecommendation({ id: 'r1' }));
    await service.submitForApproval(makeRecommendation({ id: 'r2' }));
    // maxAge=0 is falsy, so uses expiresAt (24h from now) — nothing expires
    const count = await service.expireStale(0);
    expect(count).toBe(0);
  });

  it('permits expireStale(1) to expire ALL pending approvals after 1ms', async () => {
    // VULN: maxAge=1 (truthy) means cutoff = submittedAt+1ms — virtually instant expiry
    const { repo, service } = createService();

    await service.submitForApproval(makeRecommendation({ id: 'r1' }));
    await service.submitForApproval(makeRecommendation({ id: 'r2' }));
    // Wait 2ms to ensure we're past the cutoff
    await new Promise(r => setTimeout(r, 5));
    const count = await service.expireStale(1);
    expect(count).toBe(2);
    expect(repo.approvals.every(a => a.status === 'expired')).toBe(true);
  });

  it('permits any string as actor in approve — no authorization', () => {
    // VULN: no authorization check on who can approve
    const { service } = createService();

    return service.submitForApproval(makeRecommendation()).then((approval) =>
      service.approve(approval.id, 'random-stranger', 'because I can').then((updated) => {
        expect(updated.status).toBe('approved');
        expect(updated.decidedBy).toBe('random-stranger');
      })
    );
  });

  it('permits empty string as actor in approve', () => {
    // VULN: empty actor accepted — anonymous approval
    const { service } = createService();

    return service.submitForApproval(makeRecommendation()).then((approval) =>
      service.approve(approval.id, '').then((updated) => {
        expect(updated.decidedBy).toBe('');
      })
    );
  });

  it('throws on approve of already-approved record', () => {
    // Verifies state machine rejects double-approve
    const { service } = createService();

    return service.submitForApproval(makeRecommendation()).then((approval) =>
      service.approve(approval.id, 'actor').then(() =>
        expect(service.approve(approval.id, 'actor')).rejects.toThrow('cannot be modified')
      )
    );
  });

  it('never transitions to superseded status via public API', () => {
    // VULN: superseded type exists but is unreachable — dead code
    const { repo, service } = createService();

    return service.submitForApproval(makeRecommendation({ id: 'r1' })).then(() =>
      service.submitForApproval(makeRecommendation({ id: 'r2' })).then(() => {
        // After two submissions, first is still pending, not superseded
        expect(repo.approvals[0].status).toBe('pending');
        expect(repo.approvals[1].status).toBe('pending');
      })
    );
  });

  it('does not auto-apply approved recommendations — gap between approval and action', () => {
    // VULN: approving a recommendation doesn't trigger any state mutation
    // There's no service that watches for approved recommendations and applies them
    const { service } = createService();

    return service.submitForApproval(makeRecommendation()).then((approval) =>
      service.approve(approval.id, 'operator', 'looks good').then((updated) => {
        // Approval is recorded but nothing happens — no family state mutation
        expect(updated.status).toBe('approved');
        // The recommendation's ranking changes are not applied anywhere
      })
    );
  });
});
