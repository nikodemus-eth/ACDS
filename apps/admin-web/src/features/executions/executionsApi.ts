import type { ExecutionRecord } from '@acds/core-types';
import { apiClient } from '../../lib/apiClient';

export interface ExecutionFilters {
  status?: string;
  application?: string;
  from?: string;
  to?: string;
}

export interface ExecutionDetail extends ExecutionRecord {
  rationaleSummary: string;
  fallbackHistory: Array<{
    attempt: number;
    providerId: string;
    status: string;
    latencyMs: number | null;
    errorMessage: string | null;
  }>;
}

export function listExecutions(filters: ExecutionFilters = {}): Promise<ExecutionRecord[]> {
  return apiClient.get<ExecutionRecord[]>('/executions', filters as Record<string, string | undefined>);
}

export function getExecution(id: string): Promise<ExecutionDetail> {
  return apiClient.get<ExecutionDetail>(`/executions/${id}`);
}
