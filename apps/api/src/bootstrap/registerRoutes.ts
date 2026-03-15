// ---------------------------------------------------------------------------
// Route registration – each domain area is a Fastify plugin with a prefix
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { healthRoutes } from '../routes/healthRoutes.js';
import { providersRoutes } from '../routes/providersRoutes.js';
import { dispatchRoutes } from '../routes/dispatchRoutes.js';
import { executionsRoutes } from '../routes/executionsRoutes.js';
import { auditRoutes } from '../routes/auditRoutes.js';
import { adaptationRoutes } from '../routes/adaptationRoutes.js';
import { adaptationApprovalRoutes } from '../routes/adaptationApprovalRoutes.js';
import { adaptationRollbackRoutes } from '../routes/adaptationRollbackRoutes.js';

/**
 * Registers all route modules with appropriate URL prefixes.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(providersRoutes, { prefix: '/providers' });

  await app.register(dispatchRoutes,    { prefix: '/dispatch' });
  await app.register(executionsRoutes,  { prefix: '/executions' });
  await app.register(auditRoutes,       { prefix: '/audit' });
  await app.register(adaptationRoutes,  { prefix: '/adaptation' });
  await app.register(adaptationApprovalRoutes, { prefix: '/adaptation' });
  await app.register(adaptationRollbackRoutes, { prefix: '/adaptation' });
}
