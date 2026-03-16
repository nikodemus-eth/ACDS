// ---------------------------------------------------------------------------
// Audit routes – Fastify plugin
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AuditController } from '../controllers/AuditController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

/**
 * Audit event query routes.
 *
 * - GET /     – list audit events with filters (eventType, dateRange, actor,
 *               resourceType, resourceId, application)
 * - GET /:id  – retrieve a single audit event
 *
 * All routes require authentication via the authPreHandler hook.
 */
export async function auditRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  // ── Dependency wiring (placeholder – replace with real DI) ──────────
  const controller = new AuditController(
    app.diContainer!.auditEventReader as any,
  );

  // Apply auth to all routes in this plugin scope
  app.addHook('preHandler', authPreHandler);

  // ── Routes ──────────────────────────────────────────────────────────

  /** List audit events with optional query filters. */
  app.get('/', (req, reply) => controller.list(req as any, reply));

  /** Get a single audit event by ID. */
  app.get('/:id', (req, reply) => controller.getById(req as any, reply));
}
