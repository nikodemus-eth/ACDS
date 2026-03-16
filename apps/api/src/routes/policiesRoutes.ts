import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PoliciesController } from '../controllers/PoliciesController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

export async function policiesRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const controller = new PoliciesController(app.diContainer!.policyRepository);

  app.addHook('preHandler', authPreHandler);

  app.get('/', (req, reply) => controller.list(req as any, reply));
  app.get('/:id', (req, reply) => controller.getById(req as any, reply));
  app.post('/', (req, reply) => controller.create(req as any, reply));
  app.patch('/:id', (req, reply) => controller.update(req as any, reply));
  app.delete('/:id', (req, reply) => controller.remove(req as any, reply));
}
