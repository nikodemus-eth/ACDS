// ---------------------------------------------------------------------------
// Security headers – Fastify onSend hook
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Static map of security headers applied to every outgoing response.
 */
const SECURITY_HEADERS: ReadonlyArray<[string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ['X-XSS-Protection', '1; mode=block'],
  ['Cache-Control', 'no-store, no-cache, must-revalidate'],
];

/**
 * Registers an `onSend` hook that injects hardened security headers into
 * every HTTP response before it reaches the client.
 */
export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook(
    'onSend',
    (
      _request: FastifyRequest,
      reply: FastifyReply,
      payload: unknown,
      done: (err?: Error | null, payload?: unknown) => void,
    ) => {
      for (const [header, value] of SECURITY_HEADERS) {
        reply.header(header, value);
      }
      done(null, payload);
    },
  );
}
