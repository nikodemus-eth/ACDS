// LFSI MVP — Ledger
// Spec reference: Section 14 (Logging Requirements)

import { randomUUID } from 'node:crypto';
import type { LedgerEvent, LfsiPolicy, LfsiTier, LedgerOutcome } from './types.js';

export class InMemoryLedgerSink {
  private readonly events: LedgerEvent[] = [];

  write(event: LedgerEvent): void {
    this.events.push(event);
  }

  getAll(): readonly LedgerEvent[] {
    return [...this.events];
  }

  getByTaskId(taskId: string): LedgerEvent | undefined {
    return this.events.find(e => e.taskId === taskId);
  }

  clear(): void {
    this.events.length = 0;
  }

  get size(): number {
    return this.events.length;
  }
}

export function buildLedgerEvent(params: {
  taskId: string;
  sourceSystem: string;
  capability: string;
  policyProfile: LfsiPolicy;
  selectedTier: LfsiTier;
  selectedProvider: string;
  validationPassed: boolean;
  escalated: boolean;
  escalatedTo?: string;
  finalProvider: string;
  latencyMs: number;
  resultStatus: LedgerOutcome;
  reasonCode?: string;
  attempts: number;
}): LedgerEvent {
  return {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    ...params,
  };
}
