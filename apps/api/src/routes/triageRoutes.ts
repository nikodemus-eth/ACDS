import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { TriageController } from '../controllers/TriageController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

export async function triageRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const controller = new TriageController(
    app.diContainer!.triageRunService,
  );

  app.addHook('preHandler', authPreHandler);

  app.post('/', (req, reply) => controller.triage(req as any, reply));

  app.post('/run', (req, reply) => controller.triageAndRun(req as any, reply));
}
