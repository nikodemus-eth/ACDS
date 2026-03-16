// ---------------------------------------------------------------------------
// Request / response logging hooks
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { redactHeaders } from '@acds/security';

/**
 * Registers `onRequest` and `onResponse` hooks that log every HTTP
 * transaction with method, url, status code and response time.
 *
 * Sensitive headers (Authorization, x-admin-session, cookie) are redacted
 * via `@acds/security` before being written to the log stream.
 */
export function registerRequestLogging(app: FastifyInstance): void {
  // ── onRequest – log the incoming request ──────────────────────────────
  app.addHook(
    'onRequest',
    (request: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void) => {
      request.log.info(
        {
          method: request.method,
          url: request.url,
          headers: redactHeaders(request.headers as Record<string, string>),
          requestId: request.id,
        },
        'Incoming request',
      );
      done();
    },
  );

  // ── onResponse – log the completed response with timing ───────────────
  app.addHook(
    'onResponse',
    (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
      const responseTime = reply.elapsedTime;

      request.log.info(
        {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          responseTime: `${responseTime.toFixed(1)}ms`,
          requestId: request.id,
        },
        'Request completed',
      );
      done();
    },
  );
}
