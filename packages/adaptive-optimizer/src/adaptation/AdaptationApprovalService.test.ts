import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptationApprovalService, type ApprovalAuditEvent, type ApprovalAuditEmitter, type ApprovalActionApplier } from './AdaptationApprovalService.js';
import type { AdaptationApprovalRepository } from './AdaptationApprovalRepository.js';
import type { AdaptationApproval, AdaptationApprovalStatus } from './AdaptationApprovalState.js';
import type { AdaptationRecommendation } from './AdaptationRecommendationService.js';

// Real in-process implementations of the interfaces (no mocks)

class RealApprovalRepository implements AdaptationApprovalRepository {
  private store = new Map<string, AdaptationApproval>();

  async save(approval: AdaptationApproval): Promise<void> {
    this.store.set(approval.id, { ...approval });
  }

  async findById(id: string): Promise<AdaptationApproval | undefined> {
    const a = this.store.get(id);
    return a ? { ...a } : undefined;
  }

  async findPending(): Promise<AdaptationApproval[]> {
    return [...this.store.values()].filter(a => a.status === 'pending');
  }

  async findByFamily(familyKey: string): Promise<AdaptationApproval[]> {
    return [...this.store.values()].filter(a => a.familyKey === familyKey);
  }

  async updateStatus(
    id: string,
    status: AdaptationApprovalStatus,
    fields?: { decidedAt?: string; decidedBy?: string; reason?: string },
  ): Promise<void> {
    const existing = this.store.get(id);
    if (existing) {
      this.store.set(id, { ...existing, status, ...fields });
    }
  }
}

class RealAuditEmitter implements ApprovalAuditEmitter {
  events: ApprovalAuditEvent[] = [];
  emit(event: ApprovalAuditEvent): void {
    this.events.push(event);
  }
}

class RealActionApplier implements ApprovalActionApplier {
  applied: AdaptationApproval[] = [];
  async applyApprovedRecommendation(approval: AdaptationApproval): Promise<void> {
    this.applied.push(approval);
  }
}

function makeRecommendation(overrides: Partial<AdaptationRecommendation> = {}): AdaptationRecommendation {
  return {
    id: 'rec-1',
    familyKey: 'fam:test',
    recommendedRanking: [],
    evidence: 'Test evidence',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AdaptationApprovalService', () => {
  let repo: RealApprovalRepository;
  let emitter: RealAuditEmitter;
  let applier: RealActionApplier;
  let service: AdaptationApprovalService;

  beforeEach(() => {
    repo = new RealApprovalRepository();
    emitter = new RealAuditEmitter();
    applier = new RealActionApplier();
    service = new AdaptationApprovalService(repo, emitter, applier);
  });

  describe('submitForApproval', () => {
    it('creates and saves a pending approval', async () => {
      const approval = await service.submitForApproval(makeRecommendation());
      expect(approval.status).toBe('pending');
      expect(approval.familyKey).toBe('fam:test');
      expect(approval.recommendationId).toBe('rec-1');
      expect(approval.id).toBeTruthy();
      expect(approval.submittedAt).toBeTruthy();
      expect(approval.expiresAt).toBeTruthy();
    });

    it('emits approval_submitted audit event', async () => {
      const approval = await service.submitForApproval(makeRecommendation());
      expect(emitter.events).toHaveLength(1);
      expect(emitter.events[0].type).toBe('approval_submitted');
      expect(emitter.events[0].approvalId).toBe(approval.id);
    });

    it('throws when maxAgeMs is not positive', async () => {
      await expect(service.submitForApproval(makeRecommendation(), 0)).rejects.toThrow('maxAgeMs must be a positive number');
      await expect(service.submitForApproval(makeRecommendation(), -1)).rejects.toThrow('maxAgeMs must be a positive number');
      await expect(service.submitForApproval(makeRecommendation(), NaN)).rejects.toThrow('maxAgeMs must be a positive number');
      await expect(service.submitForApproval(makeRecommendation(), Infinity)).rejects.toThrow('maxAgeMs must be a positive number');
    });

    it('throws when duplicate pending approval for same recommendation exists', async () => {
      await service.submitForApproval(makeRecommendation());
      await expect(service.submitForApproval(makeRecommendation())).rejects.toThrow('already has a pending approval');
    });

    it('allows re-submission after previous approval is approved', async () => {
      const first = await service.submitForApproval(makeRecommendation());
      await service.approve(first.id, 'admin', 'ok');
      // Now submit again for same recommendation - should succeed since old one is approved, not pending
      const second = await service.submitForApproval(makeRecommendation());
      expect(second.id).not.toBe(first.id);
    });

    it('respects custom maxAgeMs for expiresAt', async () => {
      const approval = await service.submitForApproval(makeRecommendation(), 5000);
      const submitted = new Date(approval.submittedAt).getTime();
      const expires = new Date(approval.expiresAt).getTime();
      expect(expires - submitted).toBe(5000);
    });
  });

  describe('approve', () => {
    it('transitions approval to approved status', async () => {
      const submitted = await service.submitForApproval(makeRecommendation());
      const result = await service.approve(submitted.id, 'admin', 'looks good');
      expect(result.status).toBe('approved');
      expect(result.decidedBy).toBe('admin');
      expect(result.reason).toBe('looks good');
      expect(result.decidedAt).toBeTruthy();
    });

    it('emits approval_approved audit event', async () => {
      const submitted = await service.submitForApproval(makeRecommendation());
      await service.approve(submitted.id, 'admin');
      const approved = emitter.events.find(e => e.type === 'approval_approved');
      expect(approved).toBeDefined();
      expect(approved!.actor).toBe('admin');
    });

    it('calls actionApplier when provided', async () => {
      const submitted = await service.submitForApproval(makeRecommendation());
      await service.approve(submitted.id, 'admin');
      expect(applier.applied).toHaveLength(1);
      expect(applier.applied[0].status).toBe('approved');
    });

    it('works without actionApplier', async () => {
      const serviceNoApplier = new AdaptationApprovalService(repo, emitter);
      const submitted = await serviceNoApplier.submitForApproval(makeRecommendation());
      const result = await serviceNoApplier.approve(submitted.id, 'admin');
      expect(result.status).toBe('approved');
    });

    it('throws when approval not found', async () => {
      await expect(service.approve('nonexistent', 'admin')).rejects.toThrow('Approval not found');
    });

    it('throws when approval is not pending', async () => {
      const submitted = await service.submitForApproval(makeRecommendation());
      await service.approve(submitted.id, 'admin');
      await expect(service.approve(submitted.id, 'admin')).rejects.toThrow("is in 'approved' status");
    });

    it('throws when actor is empty', async () => {
      const submitted = await service.submitForApproval(makeRecommendation());
      await expect(service.approve(submitted.id, '')).rejects.toThrow('actor is required');
      await expect(service.approve(submitted.id, '   ')).rejects.toThrow('actor is required');
    });

    it('approve with no reason sets reason as undefined', async () => {
      const submitted = await service.submitForApproval(makeRecommendation());
      const result = await service.approve(submitted.id, 'admin');
      expect(result.reason).toBeUndefined();
    });
  });

  describe('reject', () => {
    it('transitions approval to rejected status', async () => {
      const submitted = await service.submitForApproval(makeRecommendation());
      const result = await service.reject(submitted.id, 'admin', 'not ready');
      expect(result.status).toBe('rejected');
      expect(result.decidedBy).toBe('admin');
      expect(result.reason).toBe('not ready');
    });

    it('emits approval_rejected audit event', async () => {
      const submitted = await service.submitForApproval(makeRecommendation());
      await service.reject(submitted.id, 'admin', 'bad');
      const rejected = emitter.events.find(e => e.type === 'approval_rejected');
      expect(rejected).toBeDefined();
      expect(rejected!.reason).toBe('bad');
    });

    it('throws when approval not found', async () => {
      await expect(service.reject('nonexistent', 'admin')).rejects.toThrow('Approval not found');
    });

    it('throws when approval is not pending', async () => {
      const submitted = await service.submitForApproval(makeRecommendation());
      await service.reject(submitted.id, 'admin');
      await expect(service.reject(submitted.id, 'admin')).rejects.toThrow("is in 'rejected' status");
    });

    it('throws when actor is empty', async () => {
      const submitted = await service.submitForApproval(makeRecommendation());
      await expect(service.reject(submitted.id, '')).rejects.toThrow('actor is required');
    });
  });

  describe('expireStale', () => {
    it('expires approvals past their expiresAt', async () => {
      // Create an approval with very short max age
      const approval = await service.submitForApproval(makeRecommendation(), 1);
      // Wait a tiny bit to ensure expiry
      await new Promise(r => setTimeout(r, 5));
      const count = await service.expireStale();
      expect(count).toBe(1);
      const expiredEvent = emitter.events.find(e => e.type === 'approval_expired');
      expect(expiredEvent).toBeDefined();
      expect(expiredEvent!.approvalId).toBe(approval.id);
    });

    it('does not expire approvals that have not reached expiresAt', async () => {
      await service.submitForApproval(makeRecommendation(), 60_000);
      const count = await service.expireStale();
      expect(count).toBe(0);
    });

    it('uses maxAge parameter when provided', async () => {
      await service.submitForApproval(makeRecommendation(), 60_000);
      // Use a maxAge of 0 to expire immediately
      const count = await service.expireStale(0);
      expect(count).toBe(1);
    });

    it('does not expire already-decided approvals', async () => {
      const submitted = await service.submitForApproval(makeRecommendation(), 1);
      await service.approve(submitted.id, 'admin');
      await new Promise(r => setTimeout(r, 5));
      const count = await service.expireStale();
      expect(count).toBe(0);
    });

    it('returns 0 when no pending approvals', async () => {
      const count = await service.expireStale();
      expect(count).toBe(0);
    });
  });
});
