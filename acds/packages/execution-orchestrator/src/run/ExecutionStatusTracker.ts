import type { RoutingDecision, RoutingRequest, ExecutionStatus, ExecutionRecord } from '@acds/core-types';
import type { AdapterResponse } from '@acds/provider-adapters';
import type { ExecutionRecordRepository } from './ExecutionRecordService.js';
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

  constructor(
    private readonly repository?: ExecutionRecordRepository,
  ) {}

  async create(decision: RoutingDecision, request: RoutingRequest): Promise<string> {
    let id: string = randomUUID();
    if (this.repository) {
      const record = await this.repository.create({
        executionFamily: {
          application: request.application,
          process: request.process,
          step: request.step,
          decisionPosture: request.decisionPosture,
          cognitiveGrade: request.cognitiveGrade,
        },
        routingDecisionId: decision.id,
        selectedModelProfileId: decision.selectedModelProfileId,
        selectedTacticProfileId: decision.selectedTacticProfileId,
        selectedProviderId: decision.selectedProviderId,
        status: 'pending',
        inputTokens: null,
        outputTokens: null,
        latencyMs: null,
        costEstimate: null,
        normalizedOutput: null,
        errorMessage: null,
        fallbackAttempts: 0,
        createdAt: new Date(),
        completedAt: null,
      });
      id = record.id;
    }

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
    await this.persist(id, { status: 'running' });
  }

  async markSucceeded(id: string, response: AdapterResponse): Promise<void> {
    this.updateStatus(id, 'succeeded');
    await this.persist(id, {
      status: 'succeeded',
      normalizedOutput: response.content,
      latencyMs: response.latencyMs,
      completedAt: new Date(),
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    this.updateStatus(id, 'failed');
    await this.persist(id, {
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
    });
  }

  async markFallbackSucceeded(id: string): Promise<void> {
    this.updateStatus(id, 'fallback_succeeded');
    await this.persist(id, { status: 'fallback_succeeded' });
  }

  async markFallbackFailed(id: string): Promise<void> {
    this.updateStatus(id, 'fallback_failed');
    await this.persist(id, {
      status: 'fallback_failed',
      completedAt: new Date(),
    });
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

  private async persist(id: string, updates: Partial<ExecutionRecord>): Promise<void> {
    if (!this.repository) {
      return;
    }
    try {
      await this.repository.update(id, updates);
    } catch (error) {
      console.error(`[execution-tracker] Failed to persist execution ${id}:`, error);
    }
  }
}
