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
  const parsed = parseInt(
    process.env.STALE_EXECUTION_THRESHOLD_MS ??
      String(DEFAULT_STALE_THRESHOLD_MS),
    10
  );
  const thresholdMs = Number.isNaN(parsed) ? DEFAULT_STALE_THRESHOLD_MS : parsed;

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
 * In-memory ExecutionRecordRepository.
 * Stores execution records in memory for the worker process lifetime.
 */
class InMemoryExecutionRecordRepository implements ExecutionRecordRepository {
  private readonly records = new Map<string, ExecutionRecord>();
  private nextId = 1;

  async create(record: Omit<ExecutionRecord, 'id'>): Promise<ExecutionRecord> {
    const id = `exec-${String(this.nextId++).padStart(6, '0')}`;
    const full: ExecutionRecord = { ...record, id } as ExecutionRecord;
    this.records.set(id, full);
    return full;
  }

  async findById(id: string): Promise<ExecutionRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findByFamily(familyKey: string, limit = 100): Promise<ExecutionRecord[]> {
    return [...this.records.values()]
      .filter((r) => {
        const fam = r.executionFamily;
        const key = `${fam.application}:${fam.process}:${fam.step}`;
        return key === familyKey;
      })
      .slice(-limit);
  }

  async findRecent(limit = 100): Promise<ExecutionRecord[]> {
    return [...this.records.values()].slice(-limit);
  }

  async update(id: string, updates: Partial<ExecutionRecord>): Promise<ExecutionRecord> {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Execution record ${id} not found`);
    const updated = { ...existing, ...updates };
    this.records.set(id, updated);
    return updated;
  }
}

const executionRecordRepo = new InMemoryExecutionRecordRepository();

function getExecutionRecordRepository(): ExecutionRecordRepository {
  return executionRecordRepo;
}
