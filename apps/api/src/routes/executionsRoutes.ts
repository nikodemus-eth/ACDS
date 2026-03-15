// ---------------------------------------------------------------------------
// Executions routes – Fastify plugin
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ExecutionsController } from '../controllers/ExecutionsController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

/**
 * Execution record query routes.
 *
 * - GET /     – list execution records with optional filters
 * - GET /:id  – retrieve a single execution record
 *
 * All routes require authentication via the authPreHandler hook.
 */
export async function executionsRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  // ── Dependency wiring (placeholder – replace with real DI) ──────────
  const controller = new ExecutionsController(
    app.diContainer?.executionRecordService ?? ({} as any),
  );

  // Apply auth to all routes in this plugin scope
  app.addHook('preHandler', authPreHandler);

  // ── Routes ──────────────────────────────────────────────────────────

  /** List execution records with optional query filters. */
  app.get('/', (req, reply) => controller.list(req as any, reply));

  /** Get a single execution record by ID. */
  app.get('/:id', (req, reply) => controller.getById(req as any, reply));
}
