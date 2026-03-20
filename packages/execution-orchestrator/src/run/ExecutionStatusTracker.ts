import type { RoutingDecision, RoutingRequest, ExecutionStatus } from '@acds/core-types';
import type { AdapterResponse } from '@acds/provider-adapters';
import { randomUUID } from 'node:crypto';

export interface TrackedExecution {
  id: string;
  routingDecisionId: string;
  status: ExecutionStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * In-memory execution status tracker.
 *
 * LIMITATION: All state is held in memory and lost on process restart.
 * In-flight executions will be orphaned if the process crashes.
 * Call `hydrateFromRecords()` on startup to restore known executions
 * from a persistent store (e.g. database query of incomplete records).
 */
export class ExecutionStatusTracker {
  private readonly executions = new Map<string, TrackedExecution>();

  /**
   * Populate the in-memory map from externally persisted records.
   * Intended to be called once at startup to restore in-flight executions.
   */
  hydrateFromRecords(records: Array<{ id: string; status: string }>): void {
    for (const record of records) {
      this.executions.set(record.id, {
        id: record.id,
        routingDecisionId: '',
        status: record.status as ExecutionStatus,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  async create(decision: RoutingDecision, _request: RoutingRequest, _requestId?: string): Promise<string> {
    const id = randomUUID();
    this.executions.set(id, {
      id,
      routingDecisionId: decision.id,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }

  async markRunning(id: string): Promise<void> {
    this.updateStatus(id, 'running');
  }

  async markSucceeded(id: string, _response: AdapterResponse): Promise<void> {
    this.updateStatus(id, 'succeeded');
  }

  async markFailed(id: string, _errorMessage: string): Promise<void> {
    this.updateStatus(id, 'failed');
  }

  async markFallbackSucceeded(id: string): Promise<void> {
    this.updateStatus(id, 'fallback_succeeded');
  }

  async markFallbackFailed(id: string): Promise<void> {
    this.updateStatus(id, 'fallback_failed');
  }

  getStatus(id: string): TrackedExecution | undefined {
    return this.executions.get(id);
  }

  private updateStatus(id: string, status: ExecutionStatus): void {
    const execution = this.executions.get(id);
    if (!execution) {
      console.error(
        `[execution-tracker] Cannot update status to '${status}': execution ${id} not found in tracker`,
      );
      return;
    }
    execution.status = status;
    execution.updatedAt = new Date();
  }
}
