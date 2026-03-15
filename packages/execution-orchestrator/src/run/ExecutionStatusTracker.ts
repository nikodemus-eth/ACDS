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

export class ExecutionStatusTracker {
  private readonly executions = new Map<string, TrackedExecution>();

  async create(decision: RoutingDecision, _request: RoutingRequest): Promise<string> {
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
    if (execution) {
      execution.status = status;
      execution.updatedAt = new Date();
    }
  }
}
