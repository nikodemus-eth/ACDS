// ---------------------------------------------------------------------------
// ACDS API – entry point
// ---------------------------------------------------------------------------

import { buildApp } from './app.js';
import { getAppConfig } from './config/index.js';

async function main(): Promise<void> {
  const config = getAppConfig();
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`ACDS API v${config.version} listening on port ${config.port}`);
  } catch (err) {
    app.log.fatal(err, 'Failed to start ACDS API');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal} – shutting down…`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
