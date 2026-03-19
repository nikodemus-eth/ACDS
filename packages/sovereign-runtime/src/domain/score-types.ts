export interface ScoreWeights {
  cost: number; // 0-1
  latency: number; // 0-1
  reliability: number; // 0-1
  locality: number; // 0-1
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  cost: 0.3,
  latency: 0.3,
  reliability: 0.3,
  locality: 0.1,
};

export interface ProviderScore {
  providerId: string;
  methodId: string;
  totalScore: number;
  costScore: number;
  latencyScore: number;
  reliabilityScore: number;
  localityScore: number;
}

export interface ScoringResult {
  scores: ProviderScore[];
  /** Undefined when no eligible providers remain after filtering. */
  winner: ProviderScore | undefined;
  explanation: string;
}
