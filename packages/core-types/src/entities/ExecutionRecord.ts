import { ExecutionFamily } from './ExecutionFamily.js';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'fallback_succeeded'
  | 'fallback_failed'
  | 'auto_reaped';

export interface ExecutionRecord {
  id: string;
  executionFamily: ExecutionFamily;
  routingDecisionId: string;
  selectedModelProfileId: string;
  selectedTacticProfileId: string;
  selectedProviderId: string;
  status: ExecutionStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  costEstimate: number | null;
  normalizedOutput: string | null;
  errorMessage: string | null;
  fallbackAttempts: number;
  requestId: string | null;
  createdAt: Date;
  completedAt: Date | null;
}
