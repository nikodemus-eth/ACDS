// ---------------------------------------------------------------------------
// DispatchController – thin controller delegating to domain services
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RoutingRequest, DispatchRunRequest } from '@acds/core-types';
import { NotFoundError, ValidationError } from '@acds/core-types';
import type { DispatchRunService } from '@acds/execution-orchestrator';
import { RoutingDecisionPresenter } from '../presenters/RoutingDecisionPresenter.js';

export class DispatchController {
  constructor(
    private readonly runService: DispatchRunService,
  ) {}

  // ── POST /resolve ────────────────────────────────────────────────────
  /**
   * Resolves a routing decision without executing the dispatch.
   * Returns the selected model/tactic/provider and fallback chain.
   */
  async resolve(
    request: FastifyRequest<{ Body: RoutingRequest }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const result = await this.runService.resolveRoute(request.body);
      reply.send(RoutingDecisionPresenter.toView(result.decision));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reply.status(400).send({
        error: 'Bad Request',
        message,
        statusCode: 400,
      });
    }
  }

  // ── POST /run ────────────────────────────────────────────────────────
  /**
   * Resolves a routing decision AND executes the dispatch in one step.
   */
  async run(
    request: FastifyRequest<{ Body: DispatchRunRequest }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const response = await this.runService.run(request.body);
      reply.send(response);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        const message = error instanceof Error ? error.message : String(error);
        reply.status(400).send({
          error: 'Bad Request',
          message,
          statusCode: 400,
        });
      } else {
        reply.status(500).send({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while executing the dispatch',
          statusCode: 500,
        });
      }
    }
  }
}
