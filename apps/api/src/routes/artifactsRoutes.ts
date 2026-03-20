// ---------------------------------------------------------------------------
// Artifact routes – Fastify plugin (read-only catalog)
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createDefaultArtifactRegistry } from '@acds/sovereign-runtime';
import { ArtifactsController } from '../controllers/ArtifactsController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

export async function artifactsRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const registry = createDefaultArtifactRegistry();
  const controller = new ArtifactsController(registry);

  app.addHook('preHandler', authPreHandler);

  app.get('/', (req, reply) => controller.list(req, reply));

  app.get('/stats', (req, reply) => controller.stats(req, reply));

  app.get('/families', (req, reply) => controller.listFamilies(req, reply));

  app.get('/families/:family', (req, reply) =>
    controller.getFamily(req as any, reply),
  );

  // Artifact type uses a wildcard because types contain dots (ACDS.TextAssist.Rewrite.Short)
  app.get('/type/*', (req, reply) => {
    const params = (req as any).params;
    const artifactType = params['*'];
    (req as any).params = { artifactType };
    return controller.getByType(req as any, reply);
  });
}
