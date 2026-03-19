import type { CapabilityBinding } from '../registry/capability-binding.js';
import type { ScoreWeights, ProviderScore, ScoringResult } from '../domain/score-types.js';
import { DEFAULT_WEIGHTS } from '../domain/score-types.js';

export function scoreProviders(
  bindings: CapabilityBinding[],
  constraints: { maxLatencyMs?: number; maxCostUSD?: number; localOnly?: boolean },
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): ScoringResult {
  // 1. Filter by hard constraints
  let eligible = bindings;
  if (constraints.localOnly) {
    eligible = eligible.filter((b) => b.locality === 'local');
  }
  if (constraints.maxLatencyMs) {
    eligible = eligible.filter((b) => b.latency.p95 <= constraints.maxLatencyMs!);
  }
  if (constraints.maxCostUSD) {
    eligible = eligible.filter((b) => b.cost.unitCost <= constraints.maxCostUSD!);
  }

  if (eligible.length === 0) {
    // Return empty result - caller handles the error
    return {
      scores: [],
      winner: undefined as any,
      explanation: 'No eligible providers after constraint filtering',
    };
  }

  // 2. Find max values for normalization
  const maxCost = Math.max(...eligible.map((b) => b.cost.unitCost), 0.001); // avoid /0
  const maxLatency = Math.max(...eligible.map((b) => b.latency.p95), 1);

  // 3. Score each binding
  const scores: ProviderScore[] = eligible.map((b) => {
    const costScore = 1 - b.cost.unitCost / maxCost;
    const latencyScore = 1 - b.latency.p95 / maxLatency;
    const reliabilityScore = b.reliability;
    const localityScore = b.locality === 'local' ? 1.0 : 0.0;

    const totalScore =
      weights.cost * costScore +
      weights.latency * latencyScore +
      weights.reliability * reliabilityScore +
      weights.locality * localityScore;

    return {
      providerId: b.providerId,
      methodId: b.methodId,
      totalScore,
      costScore,
      latencyScore,
      reliabilityScore,
      localityScore,
    };
  });

  // 4. Sort descending by total score
  scores.sort((a, b) => b.totalScore - a.totalScore);

  const winner = scores[0];
  const explanation = `Selected ${winner.providerId}:${winner.methodId} (score: ${winner.totalScore.toFixed(3)}) from ${scores.length} eligible providers. Cost: ${winner.costScore.toFixed(2)}, Latency: ${winner.latencyScore.toFixed(2)}, Reliability: ${winner.reliabilityScore.toFixed(2)}, Locality: ${winner.localityScore.toFixed(2)}`;

  return { scores, winner, explanation };
}
