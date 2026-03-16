/**
 * Shared OptimizerStateRepository backed by PostgreSQL.
 *
 * Provides a singleton shared across all worker handlers so that
 * plateau detection, adaptation recommendations, and auto-apply
 * can all see the same optimizer state within a single process.
 */

import { createPool, PgOptimizerStateRepository } from '@acds/persistence-pg';

function createWorkerPool() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/acds');
  return createPool({
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
    database: databaseUrl.pathname.replace(/^\//, ''),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    ssl: databaseUrl.searchParams.get('sslmode') === 'require',
  });
}

const sharedOptimizerRepo = new PgOptimizerStateRepository(createWorkerPool());

export function getSharedOptimizerStateRepository(): PgOptimizerStateRepository {
  return sharedOptimizerRepo;
}
