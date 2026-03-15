// ---------------------------------------------------------------------------
// Integration Tests – Adaptive Control API (Prompt 68)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdaptationApproval } from '@acds/adaptive-optimizer';

// ---------------------------------------------------------------------------
// Types for the adaptive control API domain
// ---------------------------------------------------------------------------

interface ApprovalListFilters {
  status?: string;
  familyKey?: string;
}

interface RollbackPreviewRequest {
  targetEventId: string;
}

interface RollbackExecuteRequest {
  targetEventId: string;
  reason: string;
}

interface RollbackPreviewResponse {
  safe: boolean;
  warnings: string[];
  currentCandidateCount: number;
  restoredCandidateCount: number;
}

interface RollbackExecuteResponse {
  id: string;
  familyKey: string;
  rolledBackAt: string;
}

// ---------------------------------------------------------------------------
// Mock API Controller (simulates adaptive control REST endpoints)
// ---------------------------------------------------------------------------

class MockAdaptiveControlAPI {
  private approvals: AdaptationApproval[] = [];
  private rollbackHistory: Array<{
    id: string;
    familyKey: string;
    targetEventId: string;
    reason: string;
    rolledBackAt: string;
  }> = [];

  constructor() {
    this.seedData();
  }

  private seedData(): void {
    const now = new Date();

    this.approvals = [
      {
        id: 'approval-001',
        familyKey: 'test.family.advisory',
        recommendationId: 'rec-001',
        status: 'pending',
        submittedAt: new Date(now.getTime() - 3_600_000).toISOString(),
        expiresAt: new Date(now.getTime() + 20_400_000).toISOString(),
      },
      {
        id: 'approval-002',
        familyKey: 'test.family.draft',
        recommendationId: 'rec-002',
        status: 'approved',
        submittedAt: new Date(now.getTime() - 7_200_000).toISOString(),
        expiresAt: new Date(now.getTime() + 16_800_000).toISOString(),
        decidedAt: new Date(now.getTime() - 1_800_000).toISOString(),
        decidedBy: 'operator@acds',
        reason: 'Evidence is clear',
      },
      {
        id: 'approval-003',
        familyKey: 'test.family.advisory',
        recommendationId: 'rec-003',
        status: 'rejected',
        submittedAt: new Date(now.getTime() - 10_800_000).toISOString(),
        expiresAt: new Date(now.getTime() + 13_200_000).toISOString(),
        decidedAt: new Date(now.getTime() - 5_400_000).toISOString(),
        decidedBy: 'reviewer@acds',
        reason: 'Insufficient evidence',
      },
      {
        id: 'approval-004',
        familyKey: 'test.family.final',
        recommendationId: 'rec-004',
        status: 'expired',
        submittedAt: new Date(now.getTime() - 86_400_000).toISOString(),
        expiresAt: new Date(now.getTime() - 3_600_000).toISOString(),
      },
    ];
  }

  // GET /adaptation/approvals
  listApprovals(filters?: ApprovalListFilters): {
    status: number;
    body: AdaptationApproval[];
  } {
    let result = [...this.approvals];

    if (filters?.status) {
      result = result.filter((a) => a.status === filters.status);
    }
    if (filters?.familyKey) {
      result = result.filter((a) => a.familyKey === filters.familyKey);
    }

    return { status: 200, body: result };
  }

  // GET /adaptation/approvals/:id
  getApproval(id: string): {
    status: number;
    body: AdaptationApproval | { error: string };
  } {
    const approval = this.approvals.find((a) => a.id === id);
    if (!approval) {
      return { status: 404, body: { error: `Approval ${id} not found` } };
    }
    return { status: 200, body: approval };
  }

  // POST /adaptation/approvals/:id/approve
  approveApproval(
    id: string,
    actor: string,
    reason?: string,
  ): { status: number; body: AdaptationApproval | { error: string } } {
    const approval = this.approvals.find((a) => a.id === id);
    if (!approval) {
      return { status: 404, body: { error: `Approval ${id} not found` } };
    }
    if (approval.status !== 'pending') {
      return { status: 400, body: { error: `Approval ${id} is not pending` } };
    }

    approval.status = 'approved';
    approval.decidedAt = new Date().toISOString();
    approval.decidedBy = actor;
    approval.reason = reason;

    return { status: 200, body: { ...approval } };
  }

  // POST /adaptation/approvals/:id/reject
  rejectApproval(
    id: string,
    actor: string,
    reason?: string,
  ): { status: number; body: AdaptationApproval | { error: string } } {
    const approval = this.approvals.find((a) => a.id === id);
    if (!approval) {
      return { status: 404, body: { error: `Approval ${id} not found` } };
    }
    if (approval.status !== 'pending') {
      return { status: 400, body: { error: `Approval ${id} is not pending` } };
    }

    approval.status = 'rejected';
    approval.decidedAt = new Date().toISOString();
    approval.decidedBy = actor;
    approval.reason = reason;

    return { status: 200, body: { ...approval } };
  }

  // POST /adaptation/rollbacks/:familyKey/preview
  previewRollback(
    _familyKey: string,
    req: RollbackPreviewRequest,
  ): { status: number; body: RollbackPreviewResponse | { error: string } } {
    if (!req.targetEventId) {
      return { status: 400, body: { error: 'targetEventId is required' } };
    }

    // Simulate preview
    return {
      status: 200,
      body: {
        safe: true,
        warnings: [],
        currentCandidateCount: 3,
        restoredCandidateCount: 2,
      },
    };
  }

  // POST /adaptation/rollbacks/:familyKey/execute
  executeRollback(
    familyKey: string,
    req: RollbackExecuteRequest,
  ): { status: number; body: RollbackExecuteResponse | { error: string } } {
    if (!req.targetEventId) {
      return { status: 400, body: { error: 'targetEventId is required' } };
    }
    if (!req.reason) {
      return { status: 400, body: { error: 'reason is required' } };
    }

    const record = {
      id: randomUUID(),
      familyKey,
      targetEventId: req.targetEventId,
      reason: req.reason,
      rolledBackAt: new Date().toISOString(),
    };

    this.rollbackHistory.push(record);

    return { status: 200, body: record };
  }
}

// ===========================================================================
// Approval Endpoints
// ===========================================================================

describe('Adaptive Control API – Approval Endpoints', () => {
  let api: MockAdaptiveControlAPI;

  beforeEach(() => {
    api = new MockAdaptiveControlAPI();
  });

  it('lists all approvals', () => {
    const response = api.listApprovals();

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(4);
  });

  it('filters approvals by status', () => {
    const response = api.listApprovals({ status: 'pending' });

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(1);
    expect((response.body[0] as AdaptationApproval).status).toBe('pending');
  });

  it('filters approvals by family key', () => {
    const response = api.listApprovals({ familyKey: 'test.family.advisory' });

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(2);
    (response.body as AdaptationApproval[]).forEach((a) => {
      expect(a.familyKey).toBe('test.family.advisory');
    });
  });

  it('retrieves a single approval by id', () => {
    const response = api.getApproval('approval-002');

    expect(response.status).toBe(200);
    const approval = response.body as AdaptationApproval;
    expect(approval.id).toBe('approval-002');
    expect(approval.status).toBe('approved');
  });

  it('returns 404 for unknown approval id', () => {
    const response = api.getApproval('nonexistent');

    expect(response.status).toBe(404);
  });

  it('approves a pending approval', () => {
    const response = api.approveApproval('approval-001', 'admin@acds', 'Approved after review');

    expect(response.status).toBe(200);
    const approval = response.body as AdaptationApproval;
    expect(approval.status).toBe('approved');
    expect(approval.decidedBy).toBe('admin@acds');
  });

  it('rejects a pending approval', () => {
    const response = api.rejectApproval('approval-001', 'admin@acds', 'Not sufficient');

    expect(response.status).toBe(200);
    const approval = response.body as AdaptationApproval;
    expect(approval.status).toBe('rejected');
  });

  it('returns 400 when approving a non-pending approval', () => {
    const response = api.approveApproval('approval-002', 'admin@acds');

    expect(response.status).toBe(400);
  });
});

// ===========================================================================
// Rollback Endpoints
// ===========================================================================

describe('Adaptive Control API – Rollback Endpoints', () => {
  let api: MockAdaptiveControlAPI;

  beforeEach(() => {
    api = new MockAdaptiveControlAPI();
  });

  it('returns a rollback preview', () => {
    const response = api.previewRollback('test.family.advisory', {
      targetEventId: 'evt-001',
    });

    expect(response.status).toBe(200);
    const preview = response.body as RollbackPreviewResponse;
    expect(preview.safe).toBe(true);
    expect(preview.warnings).toHaveLength(0);
    expect(preview.currentCandidateCount).toBeGreaterThan(0);
    expect(preview.restoredCandidateCount).toBeGreaterThan(0);
  });

  it('rejects preview without targetEventId', () => {
    const response = api.previewRollback('test.family.advisory', {
      targetEventId: '',
    });

    expect(response.status).toBe(400);
  });

  it('executes a rollback successfully', () => {
    const response = api.executeRollback('test.family.advisory', {
      targetEventId: 'evt-001',
      reason: 'Performance regression detected',
    });

    expect(response.status).toBe(200);
    const result = response.body as RollbackExecuteResponse;
    expect(result.id).toBeDefined();
    expect(result.familyKey).toBe('test.family.advisory');
    expect(result.rolledBackAt).toBeDefined();
  });

  it('rejects execution without reason', () => {
    const response = api.executeRollback('test.family.advisory', {
      targetEventId: 'evt-001',
      reason: '',
    });

    expect(response.status).toBe(400);
  });

  it('rejects execution without targetEventId', () => {
    const response = api.executeRollback('test.family.advisory', {
      targetEventId: '',
      reason: 'Rolling back',
    });

    expect(response.status).toBe(400);
  });
});

// ===========================================================================
// Read Surfaces Consistency
// ===========================================================================

describe('Adaptive Control API – Read Surfaces Consistency', () => {
  let api: MockAdaptiveControlAPI;

  beforeEach(() => {
    api = new MockAdaptiveControlAPI();
  });

  it('list and detail endpoints return consistent data', () => {
    const listResponse = api.listApprovals();
    const detailResponse = api.getApproval('approval-001');

    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);

    const fromList = (listResponse.body as AdaptationApproval[]).find(
      (a) => a.id === 'approval-001',
    );
    const fromDetail = detailResponse.body as AdaptationApproval;

    expect(fromList).toBeDefined();
    expect(fromList!.familyKey).toBe(fromDetail.familyKey);
    expect(fromList!.status).toBe(fromDetail.status);
    expect(fromList!.submittedAt).toBe(fromDetail.submittedAt);
  });

  it('approved approval reflects in subsequent list calls', () => {
    api.approveApproval('approval-001', 'admin@acds');

    const response = api.listApprovals({ status: 'approved' });
    const ids = (response.body as AdaptationApproval[]).map((a) => a.id);
    expect(ids).toContain('approval-001');
  });

  it('rejected approval reflects in subsequent list calls', () => {
    api.rejectApproval('approval-001', 'admin@acds');

    const response = api.listApprovals({ status: 'rejected' });
    const ids = (response.body as AdaptationApproval[]).map((a) => a.id);
    expect(ids).toContain('approval-001');
  });

  it('all approval statuses are represented in unfiltered list', () => {
    const response = api.listApprovals();
    const statuses = new Set(
      (response.body as AdaptationApproval[]).map((a) => a.status),
    );

    expect(statuses.has('pending')).toBe(true);
    expect(statuses.has('approved')).toBe(true);
    expect(statuses.has('rejected')).toBe(true);
    expect(statuses.has('expired')).toBe(true);
  });

  it('each approval has required fields', () => {
    const response = api.listApprovals();

    for (const approval of response.body as AdaptationApproval[]) {
      expect(approval).toHaveProperty('id');
      expect(approval).toHaveProperty('familyKey');
      expect(approval).toHaveProperty('recommendationId');
      expect(approval).toHaveProperty('status');
      expect(approval).toHaveProperty('submittedAt');
      expect(approval).toHaveProperty('expiresAt');
    }
  });
});
