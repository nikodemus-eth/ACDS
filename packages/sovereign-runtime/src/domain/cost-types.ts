export type CostModel = 'free' | 'per_token' | 'per_request';

export interface CostProfile {
  model: CostModel;
  unitCost: number; // USD per unit (0 for free)
  currency: 'USD';
}

export interface LatencyProfile {
  p50: number; // ms
  p95: number;
  p99: number;
}

export interface CostConstraints {
  maxCostPerRequest?: number; // USD
  maxCostPerHour?: number; // USD
}

export const FREE_COST: CostProfile = { model: 'free', unitCost: 0, currency: 'USD' };
export const LOCAL_LATENCY: LatencyProfile = { p50: 50, p95: 200, p99: 500 };
