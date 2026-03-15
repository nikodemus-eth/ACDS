// ---------------------------------------------------------------------------
// Typed application configuration – derived from validated env vars
// ---------------------------------------------------------------------------

import { loadEnv, type EnvVars } from './env.js';

export interface AppConfig {
  /** HTTP port the server listens on */
  port: number;

  /** PostgreSQL connection string */
  databaseUrl: string;

  /** Filesystem path to the master encryption key */
  masterKeyPath: string;

  /** Secret used to validate admin session tokens */
  adminSessionSecret: string;

  /** Runtime environment */
  nodeEnv: 'development' | 'production' | 'test';

  /** Pino log level */
  logLevel: string;

  /** Application version (injected at build or read from package.json) */
  version: string;

  /** Timestamp when the process booted */
  startedAt: Date;
}

let _config: AppConfig | undefined;

/**
 * Builds the global `AppConfig` exactly once.  Subsequent calls return the
 * same frozen object.
 */
export function getAppConfig(): AppConfig {
  if (_config) return _config;

  const env: EnvVars = loadEnv();

  _config = Object.freeze<AppConfig>({
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    masterKeyPath: env.MASTER_KEY_PATH,
    adminSessionSecret: env.ADMIN_SESSION_SECRET,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    version: process.env['npm_package_version'] ?? '0.1.0',
    startedAt: new Date(),
  });

  return _config;
}
