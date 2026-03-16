import { ExecutionStatus } from '../entities/ExecutionRecord.js';

export interface DispatchRunResponse {
  executionId: string;
  status: ExecutionStatus;
  normalizedOutput: string | null;
  outputFormat: 'text' | 'json' | 'markdown';
  selectedModelProfileId: string;
  selectedTacticProfileId: string;
  selectedProviderId: string;
  latencyMs: number;
  fallbackUsed: boolean;
  fallbackAttempts: number;
  rationaleId: string;
  rationaleSummary: string;
}
