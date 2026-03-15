// ---------------------------------------------------------------------------
// Integration Tests – Adaptation Approval Workflow (Prompt 68)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdaptationRecommendation } from '@acds/adaptive-optimizer';
import type { AdaptationApproval, AdaptationApprovalStatus } from '@acds/adaptive-optimizer';
import type { AdaptationApprovalRepository } from '@acds/adaptive-optimizer';
import {
  AdaptationApprovalService,
  type ApprovalAuditEvent,
  type ApprovalAuditEmitter,
} from '@acds/adaptive-optimizer';

// ── In-memory repository ──────────────────────────────────────────────────

class InMemoryApprovalRepository implements AdaptationApprovalRepository {
  private records = new Map<string, AdaptationApproval>();

  async save(approval: AdaptationApproval): Promise<void> {
    this.records.set(approval.id, { ...approval });
  }

  async findById(id: string): Promise<AdaptationApproval | undefined> {
    const r = this.records.get(id);
    return r ? { ...r } : undefined;
  }

  async findPending(): Promise<AdaptationApproval[]> {
    return [...this.records.values()].filter((a) => a.status === 'pending');
  }

  async findByFamily(familyKey: string): Promise<AdaptationApproval[]> {
    return [...this.records.values()].filter((a) => a.familyKey === familyKey);
  }

  async updateStatus(
    id: string,
    status: AdaptationApprovalStatus,
    fields?: { decidedAt?: string; decidedBy?: string; reason?: string },
  ): Promise<void> {
    const existing = this.records.get(id);
    if (existing) {
      this.records.set(id, { ...existing, status, ...fields });
    }
  }
}

// ── Collecting audit emitter ──────────────────────────────────────────────

class CollectingAuditEmitter implements ApprovalAuditEmitter {
  readonly events: ApprovalAuditEvent[] = [];

  emit(event: ApprovalAuditEvent): void {
    this.events.push(event);
  }
}

// ── Test fixtures ─────────────────────────────────────────────────────────

function makeRecommendation(overrides?: Partial<AdaptationRecommendation>): AdaptationRecommendation {
  return {
    id: randomUUID(),
    familyKey: 'test.family.advisory',
    recommendedRanking: [],
    evidence: 'Plateau detected (severity: moderate). Family trend: stable.',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ===========================================================================
// Recommendation Creation
// ===========================================================================

describe('Approval Workflow – Recommendation Creation', () => {
  let repo: InMemoryApprovalRepository;
  let emitter: CollectingAuditEmitter;
  let service: AdaptationApprovalService;

  beforeEach(() => {
    repo = new InMemoryApprovalRepository();
    emitter = new CollectingAuditEmitter();
    service = new AdaptationApprovalService(repo, emitter);
  });

  it('creates an approval record from a recommendation', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);

    expect(approval.id).toBeDefined();
    expect(approval.familyKey).toBe(rec.familyKey);
    expect(approval.recommendationId).toBe(rec.id);
    expect(approval.status).toBe('pending');
    expect(approval.submittedAt).toBeDefined();
    expect(approval.expiresAt).toBeDefined();
  });

  it('persists the approval in the repository', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    const found = await repo.findById(approval.id);

    expect(found).toBeDefined();
    expect(found!.status).toBe('pending');
  });

  it('emits an approval_submitted audit event', async () => {
    const rec = makeRecommendation();
    await service.submitForApproval(rec);

    expect(emitter.events).toHaveLength(1);
    expect(emitter.events[0].type).toBe('approval_submitted');
    expect(emitter.events[0].familyKey).toBe(rec.familyKey);
  });
});

// ===========================================================================
// Pending State
// ===========================================================================

describe('Approval Workflow – Pending State', () => {
  let repo: InMemoryApprovalRepository;
  let emitter: CollectingAuditEmitter;
  let service: AdaptationApprovalService;

  beforeEach(() => {
    repo = new InMemoryApprovalRepository();
    emitter = new CollectingAuditEmitter();
    service = new AdaptationApprovalService(repo, emitter);
  });

  it('newly created approvals are in pending status', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);

    expect(approval.status).toBe('pending');
  });

  it('pending approvals are returned by findPending', async () => {
    await service.submitForApproval(makeRecommendation({ familyKey: 'family.a' }));
    await service.submitForApproval(makeRecommendation({ familyKey: 'family.b' }));

    const pending = await repo.findPending();
    expect(pending).toHaveLength(2);
    pending.forEach((p) => expect(p.status).toBe('pending'));
  });

  it('sets an expiry time in the future', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);

    const expiresAt = new Date(approval.expiresAt).getTime();
    const submittedAt = new Date(approval.submittedAt).getTime();

    expect(expiresAt).toBeGreaterThan(submittedAt);
  });
});

// ===========================================================================
// Approve Path
// ===========================================================================

describe('Approval Workflow – Approve Path', () => {
  let repo: InMemoryApprovalRepository;
  let emitter: CollectingAuditEmitter;
  let service: AdaptationApprovalService;

  beforeEach(() => {
    repo = new InMemoryApprovalRepository();
    emitter = new CollectingAuditEmitter();
    service = new AdaptationApprovalService(repo, emitter);
  });

  it('transitions a pending approval to approved', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    const updated = await service.approve(approval.id, 'operator@acds', 'Looks good');

    expect(updated.status).toBe('approved');
    expect(updated.decidedBy).toBe('operator@acds');
    expect(updated.reason).toBe('Looks good');
    expect(updated.decidedAt).toBeDefined();
  });

  it('persists the approved status', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    await service.approve(approval.id, 'operator@acds');

    const found = await repo.findById(approval.id);
    expect(found!.status).toBe('approved');
  });

  it('emits an approval_approved audit event', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    await service.approve(approval.id, 'operator@acds', 'Evidence is strong');

    const approvedEvents = emitter.events.filter((e) => e.type === 'approval_approved');
    expect(approvedEvents).toHaveLength(1);
    expect(approvedEvents[0].approvalId).toBe(approval.id);
    expect(approvedEvents[0].actor).toBe('operator@acds');
    expect(approvedEvents[0].reason).toBe('Evidence is strong');
  });

  it('rejects approving a non-pending approval', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    await service.approve(approval.id, 'operator@acds');

    await expect(
      service.approve(approval.id, 'other@acds'),
    ).rejects.toThrow(/cannot be modified/);
  });
});

// ===========================================================================
// Reject Path
// ===========================================================================

describe('Approval Workflow – Reject Path', () => {
  let repo: InMemoryApprovalRepository;
  let emitter: CollectingAuditEmitter;
  let service: AdaptationApprovalService;

  beforeEach(() => {
    repo = new InMemoryApprovalRepository();
    emitter = new CollectingAuditEmitter();
    service = new AdaptationApprovalService(repo, emitter);
  });

  it('transitions a pending approval to rejected', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    const updated = await service.reject(approval.id, 'operator@acds', 'Insufficient evidence');

    expect(updated.status).toBe('rejected');
    expect(updated.decidedBy).toBe('operator@acds');
    expect(updated.reason).toBe('Insufficient evidence');
  });

  it('emits an approval_rejected audit event', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    await service.reject(approval.id, 'operator@acds', 'Not now');

    const rejectedEvents = emitter.events.filter((e) => e.type === 'approval_rejected');
    expect(rejectedEvents).toHaveLength(1);
    expect(rejectedEvents[0].approvalId).toBe(approval.id);
    expect(rejectedEvents[0].reason).toBe('Not now');
  });

  it('rejects rejecting a non-pending approval', async () => {
    const rec = makeRecommendation();
    const approval = await service.submitForApproval(rec);
    await service.reject(approval.id, 'operator@acds');

    await expect(
      service.reject(approval.id, 'other@acds'),
    ).rejects.toThrow(/cannot be modified/);
  });

  it('throws when approval does not exist', async () => {
    await expect(
      service.reject('nonexistent-id', 'operator@acds'),
    ).rejects.toThrow(/not found/);
  });
});

// ===========================================================================
// Audit Event Emission
// ===========================================================================

describe('Approval Workflow – Audit Event Emission', () => {
  let repo: InMemoryApprovalRepository;
  let emitter: CollectingAuditEmitter;
  let service: AdaptationApprovalService;

  beforeEach(() => {
    repo = new InMemoryApprovalRepository();
    emitter = new CollectingAuditEmitter();
    service = new AdaptationApprovalService(repo, emitter);
  });

  it('emits events for the full approval lifecycle', async () => {
    const rec1 = makeRecommendation({ familyKey: 'family.approved' });
    const approval1 = await service.submitForApproval(rec1);
    await service.approve(approval1.id, 'operator@acds');

    const rec2 = makeRecommendation({ familyKey: 'family.rejected' });
    const approval2 = await service.submitForApproval(rec2);
    await service.reject(approval2.id, 'operator@acds');

    const types = emitter.events.map((e) => e.type);
    expect(types).toContain('approval_submitted');
    expect(types).toContain('approval_approved');
    expect(types).toContain('approval_rejected');
  });

  it('each audit event has a timestamp and familyKey', () => {
    const rec = makeRecommendation();
    service.submitForApproval(rec);

    for (const event of emitter.events) {
      expect(event.timestamp).toBeDefined();
      expect(event.familyKey).toBeDefined();
      expect(event.approvalId).toBeDefined();
    }
  });

  it('emits approval_expired events during expireStale', async () => {
    const rec = makeRecommendation();
    // Submit with a very short expiry (1 ms)
    await service.submitForApproval(rec, 1);

    // Wait a small amount to ensure expiry
    await new Promise((resolve) => setTimeout(resolve, 10));

    const count = await service.expireStale();
    expect(count).toBe(1);

    const expiredEvents = emitter.events.filter((e) => e.type === 'approval_expired');
    expect(expiredEvents).toHaveLength(1);
  });
});
