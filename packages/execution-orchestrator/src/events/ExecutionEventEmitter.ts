export type ExecutionEventType =
  | 'execution.created'
  | 'execution.running'
  | 'execution.succeeded'
  | 'execution.failed'
  | 'execution.fallback_started'
  | 'execution.fallback_succeeded'
  | 'execution.fallback_failed';

export interface ExecutionEvent {
  type: ExecutionEventType;
  executionId: string;
  timestamp: Date;
  details: Record<string, unknown>;
}

export type ExecutionEventHandler = (event: ExecutionEvent) => void;

export class ExecutionEventEmitter {
  private readonly handlers: ExecutionEventHandler[] = [];

  on(handler: ExecutionEventHandler): void {
    this.handlers.push(handler);
  }

  emit(event: ExecutionEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(
          `[event-emitter] Handler error for ${event.type} (execution ${event.executionId}):`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
}
