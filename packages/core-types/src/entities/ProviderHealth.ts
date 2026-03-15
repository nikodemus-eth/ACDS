export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ProviderHealth {
  providerId: string;
  status: ProviderHealthStatus;
  lastTestAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  latencyMs: number | null;
  message: string | null;
}
