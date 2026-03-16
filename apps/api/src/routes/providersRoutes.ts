// ---------------------------------------------------------------------------
// Provider routes – Fastify plugin
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ProvidersController } from '../controllers/ProvidersController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

/**
 * Provider management routes.
 *
 * All routes require authentication via the authPreHandler hook.
 * The controller and its dependencies are wired up here; in a production
 * setup this would come from a DI container.
 */
export async function providersRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const controller = new ProvidersController(
    app.diContainer!.registryService,
    app.diContainer!.connectionTester as any,
    app.diContainer!.secretRotationService,
    app.diContainer!.providerHealthService,
  );

  // Apply auth to all routes in this plugin scope
  app.addHook('preHandler', authPreHandler);

  // ── Routes ──────────────────────────────────────────────────────────

  app.post('/', (req, reply) => controller.create(req as any, reply));

  app.get('/', (req, reply) => controller.list(req, reply));

  app.get('/:id', (req, reply) => controller.getById(req as any, reply));

  app.put('/:id', (req, reply) => controller.update(req as any, reply));
  app.patch('/:id', (req, reply) => controller.update(req as any, reply));

  app.post('/:id/disable', (req, reply) => controller.disable(req as any, reply));

  app.post('/:id/test-connection', (req, reply) =>
    controller.testConnection(req as any, reply),
  );
  app.post('/:id/test', (req, reply) =>
    controller.testConnection(req as any, reply),
  );

  app.post('/:id/rotate-secret', (req, reply) =>
    controller.rotateSecret(req as any, reply),
  );
}
