// ---------------------------------------------------------------------------
// ExecutionsController – thin controller delegating to domain services
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ExecutionRecordService } from '@acds/execution-orchestrator';
import type { ExecutionStatus } from '@acds/core-types';
import { ExecutionRecordPresenter } from '../presenters/ExecutionRecordPresenter.js';

interface ExecutionIdParams {
  id: string;
}

interface ExecutionListQuery {
  family?: string;
  status?: ExecutionStatus;
  limit?: number;
}

export class ExecutionsController {
  constructor(
    private readonly recordService: ExecutionRecordService,
  ) {}

  // ── GET / ────────────────────────────────────────────────────────────
  /**
   * Lists execution records with optional filters.
   * Supports filtering by execution family key, status, and limit.
   */
  async list(
    request: FastifyRequest<{ Querystring: ExecutionListQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { family, limit } = request.query;

    let records;
    if (family) {
      records = await this.recordService.getByFamily(family, limit);
    } else {
      records = await this.recordService.getRecent(limit);
    }

    reply.send(ExecutionRecordPresenter.toViewList(records));
  }

  // ── GET /:id ─────────────────────────────────────────────────────────
  /**
   * Retrieves a single execution record by ID.
   */
  async getById(
    request: FastifyRequest<{ Params: ExecutionIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const record = await this.recordService.getById(request.params.id);
    if (!record) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Execution record ${request.params.id} not found`,
        statusCode: 404,
      });
      return;
    }
    reply.send(ExecutionRecordPresenter.toView(record));
  }
}
