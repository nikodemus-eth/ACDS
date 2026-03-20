/**
 * Shared OptimizerStateRepository backed by PostgreSQL.
 *
 * Provides a singleton shared across all worker handlers so that
 * plateau detection, adaptation recommendations, and auto-apply
 * can all see the same optimizer state within a single process.
 */

import { PgOptimizerStateRepository } from '@acds/persistence-pg';
import { getWorkerPool } from './createWorkerPool.js';

const sharedOptimizerRepo = new PgOptimizerStateRepository(getWorkerPool());

export function getSharedOptimizerStateRepository(): PgOptimizerStateRepository {
  return sharedOptimizerRepo;
}
