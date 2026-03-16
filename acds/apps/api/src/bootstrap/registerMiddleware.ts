// ---------------------------------------------------------------------------
// Fastify middleware (hooks) registration
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { registerRequestLogging } from '../middleware/requestLoggingMiddleware.js';
import { registerSecurityHeaders } from '../middleware/securityHeadersMiddleware.js';
import { registerErrorHandler } from '../middleware/errorMiddleware.js';

/**
 * Attaches application-level hooks and error handlers to the Fastify instance.
 * Order matters: logging -> security headers -> error handler.
 */
export async function registerMiddleware(app: FastifyInstance): Promise<void> {
  registerRequestLogging(app);
  registerSecurityHeaders(app);
  registerErrorHandler(app);
}
