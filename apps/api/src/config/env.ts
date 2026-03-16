// ---------------------------------------------------------------------------
// Environment variable validation – fail fast on missing required values
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  MASTER_KEY_PATH: string;
  ADMIN_SESSION_SECRET: string;
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: string;
}

function loadDotEnvFile(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
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
  loadDotEnvFile();
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
