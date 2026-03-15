import type { ExecutionRecord } from '@acds/core-types';
import {
  ExecutionRecordService,
  type ExecutionRecordRepository,
} from '@acds/execution-orchestrator';

const DEFAULT_STALE_THRESHOLD_MS = 600_000; // 10 minutes

/**
 * Finds executions stuck in 'running' for longer than the configured threshold
 * and marks them as failed.
 */
export async function cleanupStaleExecutions(): Promise<void> {
  const thresholdMs = parseInt(
    process.env.STALE_EXECUTION_THRESHOLD_MS ??
      String(DEFAULT_STALE_THRESHOLD_MS),
    10
  );

  // TODO: Replace with DI-resolved instances once container is wired
  const executionRepository = getExecutionRecordRepository();
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

/**
 * Placeholder factory for ExecutionRecordRepository.
 * Will be replaced by DI container resolution.
 */
function getExecutionRecordRepository(): ExecutionRecordRepository {
  // TODO: Wire to actual database-backed repository
  throw new Error(
    'ExecutionRecordRepository not yet wired. Configure DI container or set DATABASE_URL.'
  );
}
