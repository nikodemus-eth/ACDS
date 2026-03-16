import type { ExecutionRecord } from '@acds/core-types';
import { ExecutionRecordService } from '@acds/execution-orchestrator';
import { createPool, PgExecutionRecordRepository } from '@acds/persistence-pg';

const DEFAULT_STALE_THRESHOLD_MS = 600_000; // 10 minutes

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

export async function cleanupStaleExecutions(): Promise<void> {
  const parsed = parseInt(
    process.env.STALE_EXECUTION_THRESHOLD_MS ??
      String(DEFAULT_STALE_THRESHOLD_MS),
    10
  );
  const thresholdMs = Number.isNaN(parsed) ? DEFAULT_STALE_THRESHOLD_MS : parsed;

  const pool = createWorkerPool();
  const executionRepository = new PgExecutionRecordRepository(pool);
  const executionService = new ExecutionRecordService(executionRepository);

  const recentExecutions = await executionService.getRecent(500);

  const now = Date.now();
  const staleExecutions = recentExecutions.filter(
    (record: ExecutionRecord) =>
      record.status === 'running' &&
      record.createdAt &&
      now - new Date(record.createdAt).getTime() > thresholdMs
  );

  if (staleExecutions.length === 0) {
    return;
  }

  console.log(
    `[stale-cleanup] Found ${staleExecutions.length} stale execution(s). Marking as failed...`
  );

  for (const execution of staleExecutions) {
    try {
      await executionService.updateStatus(execution.id, {
        status: 'failed',
        errorMessage: `Execution timed out after ${thresholdMs}ms (marked stale by worker)`,
        completedAt: new Date(),
      });

      console.log(
        `[stale-cleanup] Marked execution ${execution.id} as failed (was running since ${execution.createdAt.toISOString()})`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[stale-cleanup] Failed to update execution ${execution.id}: ${message}`
      );
    }
  }

  console.log(
    `[stale-cleanup] Cleanup complete. Processed ${staleExecutions.length} stale execution(s).`
  );
}
