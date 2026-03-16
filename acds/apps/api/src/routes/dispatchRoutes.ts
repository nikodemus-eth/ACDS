// ---------------------------------------------------------------------------
// Dispatch routes – Fastify plugin
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { DispatchController } from '../controllers/DispatchController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

/**
 * Dispatch routing and execution routes.
 *
 * - POST /resolve  – resolve a routing decision without executing
 * - POST /run      – resolve + execute in a single request
 *
 * All routes require authentication via the authPreHandler hook.
 * The controller and its dependencies are wired up here; in a production
 * setup this would come from a DI container.
 */
export async function dispatchRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const controller = new DispatchController(
    app.diContainer!.dispatchRunService,
  );

  // Apply auth to all routes in this plugin scope
  app.addHook('preHandler', authPreHandler);

  // ── Routes ──────────────────────────────────────────────────────────

  /** Resolve routing decision only – no execution. */
  app.post('/resolve', (req, reply) => controller.resolve(req as any, reply));

  /** Resolve routing decision AND execute the dispatch. */
  app.post('/run', (req, reply) => controller.run(req as any, reply));
}
