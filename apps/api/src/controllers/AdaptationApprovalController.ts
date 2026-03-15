// ---------------------------------------------------------------------------
// AdaptationApprovalController - thin controller for approval workflow routes
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AdaptationApprovalRepository } from '@acds/adaptive-optimizer';
import { AdaptationApprovalService, type ApprovalAuditEmitter } from '@acds/adaptive-optimizer';
import { AdaptationApprovalPresenter } from '../presenters/AdaptationApprovalPresenter.js';

// ── Route-level param/body types ──────────────────────────────────────────

interface ApprovalIdParams {
  id: string;
}

interface ApprovalDecisionBody {
  actor: string;
  reason?: string;
}

// ── Controller ────────────────────────────────────────────────────────────

export class AdaptationApprovalController {
  private readonly service: AdaptationApprovalService;

  constructor(
    private readonly repository: AdaptationApprovalRepository,
    auditEmitter: ApprovalAuditEmitter,
  ) {
    this.service = new AdaptationApprovalService(repository, auditEmitter);
  }

  // ── GET /approvals ──────────────────────────────────────────────────
  async list(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const pending = await this.repository.findPending();
    reply.send(AdaptationApprovalPresenter.toViewList(pending));
  }

  // ── GET /approvals/:id ──────────────────────────────────────────────
  async getById(
    request: FastifyRequest<{ Params: ApprovalIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const approval = await this.repository.findById(request.params.id);
    if (!approval) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Approval ${request.params.id} not found`,
        statusCode: 404,
      });
      return;
    }
    reply.send(AdaptationApprovalPresenter.toView(approval));
  }

  // ── POST /approvals/:id/approve ─────────────────────────────────────
  async approve(
    request: FastifyRequest<{ Params: ApprovalIdParams; Body: ApprovalDecisionBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { actor, reason } = request.body;
      const updated = await this.service.approve(request.params.id, actor, reason);
      reply.send(AdaptationApprovalPresenter.toView(updated));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found')) {
        reply.status(404).send({ error: 'Not Found', message, statusCode: 404 });
      } else {
        reply.status(409).send({ error: 'Conflict', message, statusCode: 409 });
      }
    }
  }

  // ── POST /approvals/:id/reject ──────────────────────────────────────
  async reject(
    request: FastifyRequest<{ Params: ApprovalIdParams; Body: ApprovalDecisionBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { actor, reason } = request.body;
      const updated = await this.service.reject(request.params.id, actor, reason);
      reply.send(AdaptationApprovalPresenter.toView(updated));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found')) {
        reply.status(404).send({ error: 'Not Found', message, statusCode: 404 });
      } else {
        reply.status(409).send({ error: 'Conflict', message, statusCode: 409 });
      }
    }
  }
}
