import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ProfilesController } from '../controllers/ProfilesController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

export async function profilesRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const controller = new ProfilesController(app.diContainer!.profileCatalogService as any);

  app.addHook('preHandler', authPreHandler);

  app.get('/model', (req, reply) => controller.listModelProfiles(req, reply));
  app.get('/model/:id', (req, reply) => controller.getModelProfile(req as any, reply));
  app.post('/model', (req, reply) => controller.createModelProfile(req as any, reply));
  app.patch('/model/:id', (req, reply) => controller.updateModelProfile(req as any, reply));
  app.delete('/model/:id', (req, reply) => controller.deleteModelProfile(req as any, reply));

  app.get('/tactic', (req, reply) => controller.listTacticProfiles(req, reply));
  app.get('/tactic/:id', (req, reply) => controller.getTacticProfile(req as any, reply));
  app.post('/tactic', (req, reply) => controller.createTacticProfile(req as any, reply));
  app.patch('/tactic/:id', (req, reply) => controller.updateTacticProfile(req as any, reply));
  app.delete('/tactic/:id', (req, reply) => controller.deleteTacticProfile(req as any, reply));
}
