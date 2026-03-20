import type { RoutingDecision, RoutingRequest, ExecutionRecord } from '@acds/core-types';
import type { AdapterResponse } from '@acds/provider-adapters';
import type { ExecutionRecordRepository } from '@acds/execution-orchestrator';
import { ExecutionStatusTracker } from '@acds/execution-orchestrator';
import type { ExecutionAuditWriter } from '@acds/audit-ledger';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;

/**
 * Wraps the in-memory ExecutionStatusTracker with database persistence
 * and audit event emission.
 *
 * On `create()`, writes an initial execution record and emits execution.started.
 * On status transitions, updates the persisted record and emits the
 * corresponding audit event (execution.completed or execution.failed).
 *
 * Status updates use retry-with-backoff to prevent silent data loss
 * that leaves execution records stuck in "running" state.
 */
export class PersistingExecutionStatusTracker extends ExecutionStatusTracker {
  private readonly requests = new Map<string, { decision: RoutingDecision; request: RoutingRequest }>();

  constructor(
    private readonly repository: ExecutionRecordRepository,
    private readonly auditWriter?: ExecutionAuditWriter,
  ) {
    super();
  }

  override async create(decision: RoutingDecision, request: RoutingRequest, requestId?: string): Promise<string> {
    const id = await super.create(decision, request, requestId);
    this.requests.set(id, { decision, request });

    try {
      await this.repository.create({
        id,
        executionFamily: {
          application: request.application,
          process: request.process,
          step: request.step ?? '',
          decisionPosture: request.decisionPosture ?? 'standard',
          cognitiveGrade: request.cognitiveGrade ?? 'C',
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
        requestId: requestId ?? null,
        createdAt: new Date(),
        completedAt: null,
      });
    } catch (err) {
      console.error('[persisting-tracker] Failed to persist execution record:', err);
    }

    await this.safeAudit(() =>
      this.auditWriter?.writeExecutionStarted(id, request.application, {
        process: request.process,
        step: request.step,
        modelProfileId: decision.selectedModelProfileId,
        tacticProfileId: decision.selectedTacticProfileId,
        providerId: decision.selectedProviderId,
      }),
    );

    return id;
  }

  override async markRunning(id: string): Promise<void> {
    await super.markRunning(id);
    await this.retryUpdate(id, { status: 'running' });
  }

  override async markSucceeded(id: string, response: AdapterResponse): Promise<void> {
    await super.markSucceeded(id, response);
    await this.retryUpdate(id, {
      status: 'succeeded',
      normalizedOutput: response.content,
      latencyMs: response.latencyMs,
      inputTokens: response.inputTokens ?? null,
      outputTokens: response.outputTokens ?? null,
      completedAt: new Date(),
    });

    const ctx = this.requests.get(id);
    await this.safeAudit(() =>
      this.auditWriter?.writeExecutionCompleted(id, ctx?.request.application ?? 'unknown', {
        latencyMs: response.latencyMs,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      }),
    );
  }

  override async markFailed(id: string, errorMessage: string): Promise<void> {
    await super.markFailed(id, errorMessage);
    await this.retryUpdate(id, {
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
    });

    const ctx = this.requests.get(id);
    await this.safeAudit(() =>
      this.auditWriter?.writeExecutionFailed(id, ctx?.request.application ?? 'unknown', {
        error: errorMessage,
      }),
    );
  }

  override async markFallbackSucceeded(id: string): Promise<void> {
    await super.markFallbackSucceeded(id);
    await this.retryUpdate(id, {
      status: 'fallback_succeeded',
      completedAt: new Date(),
    });

    const ctx = this.requests.get(id);
    await this.safeAudit(() =>
      this.auditWriter?.writeExecutionCompleted(id, ctx?.request.application ?? 'unknown', {
        fallback: true,
      }),
    );
  }

  override async markFallbackFailed(id: string): Promise<void> {
    await super.markFallbackFailed(id);
    await this.retryUpdate(id, {
      status: 'fallback_failed',
      completedAt: new Date(),
    });

    const ctx = this.requests.get(id);
    await this.safeAudit(() =>
      this.auditWriter?.writeExecutionFailed(id, ctx?.request.application ?? 'unknown', {
        fallback: true,
        error: 'All fallback providers exhausted',
      }),
    );
  }

  private async retryUpdate(id: string, updates: Partial<ExecutionRecord>): Promise<void> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await this.repository.update(id, updates);
        return;
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) {
          console.error(
            `[persisting-tracker] FAILED to update execution ${id} after ${MAX_RETRIES} attempts. ` +
            `Status update to '${updates.status}' was lost. Record may be stuck.`,
            err,
          );
          return;
        }
        const delay = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(
          `[persisting-tracker] Retry ${attempt + 1}/${MAX_RETRIES} for execution ${id} in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async safeAudit(fn: () => Promise<void> | undefined): Promise<void> {
    try {
      await fn();
    } catch (err) {
      console.error('[persisting-tracker] Failed to emit audit event:', err);
    }
  }
}
