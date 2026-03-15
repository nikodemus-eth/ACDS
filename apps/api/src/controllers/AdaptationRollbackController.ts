// ---------------------------------------------------------------------------
// AdaptationRollbackController - thin controller for rollback routes
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AdaptationRollbackService } from '@acds/adaptive-optimizer';
import { NotFoundError, ConflictError } from '@acds/core-types';
import { AdaptationRollbackPresenter } from '../presenters/AdaptationRollbackPresenter.js';

// ── Route-level param/query/body types ────────────────────────────────────

interface FamilyKeyParams {
  familyKey: string;
}

interface RollbackPreviewQuery {
  targetEventId: string;
}

interface RollbackExecuteBody {
  targetEventId: string;
  actor: string;
  reason: string;
}

// ── Controller ────────────────────────────────────────────────────────────

export class AdaptationRollbackController {
  constructor(
    private readonly rollbackService: AdaptationRollbackService,
  ) {}

  // ── GET /rollbacks/:familyKey/preview?targetEventId=... ─────────────
  async previewRollback(
    request: FastifyRequest<{ Params: FamilyKeyParams; Querystring: RollbackPreviewQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { familyKey } = request.params;
    const { targetEventId } = request.query;

    if (!targetEventId) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Query parameter targetEventId is required.',
        statusCode: 400,
      });
      return;
    }

    try {
      const preview = await this.rollbackService.previewRollback(familyKey, targetEventId);
      reply.send({
        safe: preview.safe,
        warnings: preview.warnings,
        preview: AdaptationRollbackPresenter.toView(preview.preview),
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        reply.status(404).send({ error: 'Not Found', message: error.message, statusCode: 404 });
      } else {
        throw error;
      }
    }
  }

  // ── POST /rollbacks/:familyKey/execute ──────────────────────────────
  async executeRollback(
    request: FastifyRequest<{ Params: FamilyKeyParams; Body: RollbackExecuteBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { familyKey } = request.params;
    const { targetEventId, actor, reason } = request.body;

    if (!targetEventId || !actor || !reason) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Fields targetEventId, actor, and reason are required.',
        statusCode: 400,
      });
      return;
    }

    try {
      const record = await this.rollbackService.executeRollback(
        familyKey,
        targetEventId,
        actor,
        reason,
      );
      reply.status(201).send(AdaptationRollbackPresenter.toView(record));
    } catch (error) {
      if (error instanceof NotFoundError) {
        reply.status(404).send({ error: 'Not Found', message: error.message, statusCode: 404 });
      } else if (error instanceof ConflictError) {
        reply.status(409).send({ error: 'Conflict', message: error.message, statusCode: 409 });
      } else {
        throw error;
      }
    }
  }
}
