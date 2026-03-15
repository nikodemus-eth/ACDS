// ---------------------------------------------------------------------------
// Fastify application factory
// ---------------------------------------------------------------------------

import Fastify, { type FastifyInstance } from 'fastify';
import { getAppConfig } from './config/index.js';
import { registerPlugins } from './bootstrap/registerPlugins.js';
import { registerMiddleware } from './bootstrap/registerMiddleware.js';
import { registerRoutes } from './bootstrap/registerRoutes.js';

export interface BuildAppOptions {
  /** Override the default logger (useful in tests) */
  logger?: boolean | object;
}

/**
 * Creates, configures and returns a ready-to-listen Fastify instance.
 *
 * Sequence:
 *   1. Plugins  (cors, etc.)
 *   2. Middleware (logging, security headers, error handler)
 *   3. Routes   (health, providers, dispatch, …)
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = getAppConfig();

  const app = Fastify({
    logger: opts.logger ?? {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Decorate the instance so routes/hooks can access config
  app.decorate('config', config);

  await registerPlugins(app);
  await registerMiddleware(app);
  await registerRoutes(app);

  return app;
}
