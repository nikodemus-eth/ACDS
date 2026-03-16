// ---------------------------------------------------------------------------
// Adaptation routes - Fastify plugin for adaptive optimizer read surface
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AdaptationController } from '../controllers/AdaptationController.js';
import { authPreHandler } from '../middleware/authMiddleware.js';

/**
 * Adaptation read routes.
 *
 * - GET /families                        - list family performance summaries
 * - GET /families/:familyKey             - family detail
 * - GET /families/:familyKey/candidates  - candidate rankings for a family
 * - GET /events                          - list adaptation events
 * - GET /recommendations                 - list pending recommendations
 *
 * All routes require authentication via the authPreHandler hook.
 */
export async function adaptationRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const controller = new AdaptationController(
    app.diContainer!.familyPerformanceReader,
    app.diContainer!.candidateRankingReader,
    app.diContainer!.adaptationEventReader,
    app.diContainer!.adaptationRecommendationReader,
  );

  // Apply auth to all routes in this plugin scope
  app.addHook('preHandler', authPreHandler);

  // ── Routes ──────────────────────────────────────────────────────────

  /** List all family performance summaries. */
  app.get('/families', (req, reply) => controller.listFamilies(req, reply));

  /** Get a single family's performance detail. */
  app.get('/families/:familyKey', (req, reply) =>
    controller.getFamilyDetail(req as any, reply),
  );

  /** Get candidate rankings for a family. */
  app.get('/families/:familyKey/candidates', (req, reply) =>
    controller.getCandidateRankings(req as any, reply),
  );

  /** List adaptation events with optional filters. */
  app.get('/events', (req, reply) =>
    controller.listAdaptationEvents(req as any, reply),
  );

  /** List pending adaptation recommendations. */
  app.get('/recommendations', (req, reply) =>
    controller.listRecommendations(req, reply),
  );
}
