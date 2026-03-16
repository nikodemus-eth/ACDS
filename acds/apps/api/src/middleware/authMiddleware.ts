// ---------------------------------------------------------------------------
// Authentication middleware – Fastify preHandler hook
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAppConfig } from '../config/index.js';

/**
 * Paths that bypass authentication entirely.
 */
const PUBLIC_PATHS = new Set<string>(['/health', '/health/providers']);

/**
 * Fastify preHandler hook that enforces authentication on every request
 * unless the route is in the public allowlist.
 *
 * Two authentication strategies are supported (MVP):
 *   1. `x-admin-session` header – compared against ADMIN_SESSION_SECRET
 *   2. `Authorization: Bearer <token>` header – same comparison
 *
 * Returns 401 if neither header supplies a valid credential.
 */
export function authPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void,
): void {
  // Allow public endpoints
  if (PUBLIC_PATHS.has(request.url)) {
    done();
    return;
  }

  const config = getAppConfig();
  const adminSession = request.headers['x-admin-session'] as string | undefined;
  const authHeader = request.headers['authorization'] as string | undefined;

  // Strategy 1: admin session header
  if (adminSession && adminSession === config.adminSessionSecret) {
    done();
    return;
  }

  // Strategy 2: Bearer token
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme === 'Bearer' && token && token === config.adminSessionSecret) {
      done();
      return;
    }
  }

  reply.code(401).send({
    error: 'Unauthorized',
    message: 'Missing or invalid authentication credentials',
    statusCode: 401,
  });
}

/**
 * Registers the auth preHandler hook on the given Fastify instance.
 */
export function registerAuth(app: FastifyInstance): void {
  app.addHook('preHandler', authPreHandler);
}
