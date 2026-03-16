import pg from 'pg';

const { Pool } = pg;

export interface PgPoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean | object;
}

/**
 * Creates a pg.Pool instance from configuration.
 * Callers should share a single pool across all repositories.
 */
export function createPool(config: PgPoolConfig): pg.Pool {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.max ?? 20,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5_000,
    ssl: config.ssl,
  });
}

export type { Pool } from 'pg';
