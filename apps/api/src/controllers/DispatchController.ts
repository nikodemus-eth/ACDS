// ---------------------------------------------------------------------------
// DispatchController – thin controller delegating to domain services
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RoutingRequest, DispatchRunRequest } from '@acds/core-types';
import type { DispatchResolver } from '@acds/routing-engine';
import type { DispatchRunService } from '@acds/execution-orchestrator';
import { RoutingDecisionPresenter } from '../presenters/RoutingDecisionPresenter.js';

export class DispatchController {
  constructor(
    private readonly resolver: DispatchResolver,
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
    const deps = (request.server as any).diContainer?.resolverDeps;
    if (!deps) {
      reply.status(500).send({
        error: 'Internal Server Error',
        message: 'DispatchResolver dependencies not configured. Ensure DI container is initialized.',
        statusCode: 500,
      });
      return;
    }

    try {
      const result = this.resolver.resolve(request.body, deps);
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
    const response = await this.runService.run(request.body);
    reply.send(response);
  }
}
