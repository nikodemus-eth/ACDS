// ---------------------------------------------------------------------------
// Fastify plugin registration
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

/**
 * Registers third-party Fastify plugins (CORS, etc.).
 * Called early in the bootstrap sequence before middleware and routes.
 */
export async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-admin-session',
      'x-request-id',
    ],
  });
}
