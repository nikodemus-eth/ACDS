import type { ExecutionEvent } from './ExecutionEventEmitter.js';

export class ExecutionLifecycleLogger {
  log(event: ExecutionEvent): void {
    const details = Object.keys(event.details).length > 0
      ? ` | ${JSON.stringify(event.details)}`
      : '';
    console.log(
      `[execution-lifecycle] ${event.type} | execution=${event.executionId} | time=${event.timestamp.toISOString()}${details}`,
    );
  }
}
