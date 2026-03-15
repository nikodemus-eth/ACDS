/**
 * ExecutionOutcomePublisher - Publishes normalized execution outcome events.
 *
 * Uses a handler-based publisher pattern: register handlers via `onOutcome`,
 * then call `publish` to notify all registered handlers with a normalized
 * ExecutionOutcome payload.
 */

export type ExecutionOutcomeStatus = 'success' | 'failure' | 'fallback_success' | 'fallback_failure';

/**
 * Normalized execution outcome event.
 */
export interface ExecutionOutcome {
  /** Unique execution identifier. */
  executionId: string;

  /** The execution family key (e.g. "app:process:step"). */
  familyKey: string;

  /** Final outcome status. */
  status: ExecutionOutcomeStatus;

  /** Total latency in milliseconds from dispatch to completion. */
  latencyMs: number;

  /** Summary of the adapter response (model, tokens, etc). */
  adapterResponseSummary: Record<string, unknown>;

  /** ISO-8601 timestamp of when the outcome was recorded. */
  timestamp: string;
}

export type ExecutionOutcomeHandler = (outcome: ExecutionOutcome) => void | Promise<void>;

export class ExecutionOutcomePublisher {
  private readonly handlers: ExecutionOutcomeHandler[] = [];

  /**
   * Registers a handler to be called when an outcome is published.
   */
  onOutcome(handler: ExecutionOutcomeHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Publishes an execution outcome to all registered handlers.
   * Handlers are invoked sequentially; errors in one handler do not
   * prevent subsequent handlers from executing.
   */
  async publish(outcome: ExecutionOutcome): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(outcome);
      } catch (error) {
        console.error(
          `[outcome-publisher] Handler error for execution ${outcome.executionId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /**
   * Returns the number of registered handlers.
   */
  get handlerCount(): number {
    return this.handlers.length;
  }
}
