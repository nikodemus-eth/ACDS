// ---------------------------------------------------------------------------
// Adaptation Approval routes - Fastify plugin for approval workflow
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AdaptationApprovalController } from '../controllers/AdaptationApprovalController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

/**
 * Adaptation approval routes.
 *
 * - GET  /approvals              - list pending approvals
 * - GET  /approvals/:id          - get approval by id
 * - POST /approvals/:id/approve  - approve a pending approval
 * - POST /approvals/:id/reject   - reject a pending approval
 *
 * All routes require authentication via the authPreHandler hook.
 */
export async function adaptationApprovalRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const controller = new AdaptationApprovalController(
    app.diContainer!.adaptationApprovalRepository,
    app.diContainer!.approvalAuditEmitter,
  );

  // Apply auth to all routes in this plugin scope
  app.addHook('preHandler', authPreHandler);

  // ── Routes ──────────────────────────────────────────────────────────

  /** List all pending approvals. */
  app.get('/approvals', (req, reply) => controller.list(req, reply));

  /** Get a single approval by id. */
  app.get('/approvals/:id', (req, reply) =>
    controller.getById(req as any, reply),
  );

  /** Approve a pending approval. */
  app.post('/approvals/:id/approve', (req, reply) =>
    controller.approve(req as any, reply),
  );

  /** Reject a pending approval. */
  app.post('/approvals/:id/reject', (req, reply) =>
    controller.reject(req as any, reply),
  );
}
