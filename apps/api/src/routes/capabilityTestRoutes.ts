// ---------------------------------------------------------------------------
// Capability Test routes – Fastify plugin
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { CapabilityTestController } from '../controllers/CapabilityTestController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

export async function capabilityTestRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const service = app.diContainer!.capabilityTestService;
  const controller = new CapabilityTestController(service);

  app.addHook('preHandler', authPreHandler);

  app.get('/:id/capabilities', (req, reply) =>
    controller.getManifest(req as any, reply),
  );

  app.post('/:id/capabilities/:capabilityId/test', (req, reply) =>
    controller.testCapability(req as any, reply),
  );

  // Translation languages — proxies to the Apple Intelligence bridge
  app.get('/translation/languages', async (_req, reply) => {
    try {
      const bridgeUrl = process.env['APPLE_BRIDGE_URL'] ?? 'http://127.0.0.1:11435';
      const response = await fetch(`${bridgeUrl}/translation/languages`);
      const data = await response.json();
      reply.send(data);
    } catch {
      reply.status(503).send({ error: 'Apple Intelligence bridge unavailable' });
    }
  });
}
