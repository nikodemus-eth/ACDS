// ---------------------------------------------------------------------------
// Adaptation Rollback routes - Fastify plugin for rollback tooling
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AdaptationRollbackController } from '../controllers/AdaptationRollbackController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

/**
 * Adaptation rollback routes.
 *
 * - GET  /rollbacks/:familyKey/preview?targetEventId=...  - preview rollback
 * - POST /rollbacks/:familyKey/execute                    - execute rollback
 *
 * All routes require authentication via the authPreHandler hook.
 */
export async function adaptationRollbackRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const controller = new AdaptationRollbackController(
    app.diContainer!.adaptationRollbackService,
  );

  // Apply auth to all routes in this plugin scope
  app.addHook('preHandler', authPreHandler);

  // ── Routes ──────────────────────────────────────────────────────────

  /** Preview a rollback for a family. */
  app.get('/rollbacks/:familyKey/preview', (req, reply) =>
    controller.previewRollback(req as any, reply),
  );

  /** Execute a rollback for a family. */
  app.post('/rollbacks/:familyKey/execute', (req, reply) =>
    controller.executeRollback(req as any, reply),
  );
}
