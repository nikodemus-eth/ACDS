// ---------------------------------------------------------------------------
// Global error handler – normalises all errors to a safe JSON shape
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { redactError } from '@acds/security';

interface NormalisedError {
  error: string;
  message: string;
  statusCode: number;
}

/**
 * Determines the HTTP status code for an error.
 */
function resolveStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e['statusCode'] === 'number') return e['statusCode'];
    if (typeof e['status'] === 'number') return e['status'];
  }
  return 500;
}

/**
 * Registers Fastify's `setErrorHandler` to intercept every unhandled error.
 *
 * - Uses `@acds/security` `redactError` to strip secrets.
 * - Always returns `{ error, message, statusCode }`.
 * - Never leaks internal stack traces in production.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: Error, request: FastifyRequest, reply: FastifyReply) => {
      const statusCode = resolveStatusCode(error);
      const safeError = redactError(error);

      const body: NormalisedError = {
        error: statusCode >= 500 ? 'Internal Server Error' : (safeError.code ?? 'Error'),
        message:
          statusCode >= 500 && app.config?.nodeEnv === 'production'
            ? 'An unexpected error occurred'
            : safeError.message,
        statusCode,
      };

      request.log.error(
        { err: safeError, statusCode, url: request.url },
        'Request error',
      );

      reply.status(statusCode).send(body);
    },
  );
}
