import { useQuery } from '@tanstack/react-query';
import {
  listExecutions,
  getExecution,
  type ExecutionFilters,
} from '../features/executions/executionsApi';

const EXECUTIONS_KEY = ['executions'] as const;

export function useExecutions(filters: ExecutionFilters = {}) {
  return useQuery({
    queryKey: [...EXECUTIONS_KEY, filters],
    queryFn: () => listExecutions(filters),
  });
}

export function useExecution(id: string) {
  return useQuery({
    queryKey: [...EXECUTIONS_KEY, id],
    queryFn: () => getExecution(id),
    enabled: !!id,
  });
}
