// ---------------------------------------------------------------------------
// Health routes – Fastify plugin
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { HealthController } from '../controllers/HealthController.js';

/**
 * Health-check routes.  These are public (no auth required).
 */
export async function healthRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const controller = new HealthController(
    app.diContainer!.providerHealthService,
  );

  // ── Routes ──────────────────────────────────────────────────────────

  app.get('/health', (req, reply) => controller.appHealth(req, reply));

  app.get('/health/providers', (req, reply) =>
    controller.providerHealthSummary(req, reply),
  );
}
