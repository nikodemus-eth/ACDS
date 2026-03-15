// ---------------------------------------------------------------------------
// Environment variable validation – fail fast on missing required values
// ---------------------------------------------------------------------------

export interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  MASTER_KEY_PATH: string;
  ADMIN_SESSION_SECRET: string;
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
}

/**
 * Validates and returns a typed snapshot of all required environment
 * variables.  Called once at startup – throws immediately when a mandatory
 * variable is absent so the process never runs in a half-configured state.
 */
export function loadEnv(): EnvVars {
  const nodeEnv = optional('NODE_ENV', 'development') as EnvVars['NODE_ENV'];

  return {
    PORT: Number(optional('PORT', '3100')),
    DATABASE_URL: required('DATABASE_URL'),
    MASTER_KEY_PATH: required('MASTER_KEY_PATH'),
    ADMIN_SESSION_SECRET: required('ADMIN_SESSION_SECRET'),
    NODE_ENV: nodeEnv,
    LOG_LEVEL: optional('LOG_LEVEL', nodeEnv === 'production' ? 'info' : 'debug'),
  };
}
