/**
 * ApplicationWeightResolver - Returns metric weight configurations
 * tailored to specific applications.
 */

import type { WeightConfig } from './ExecutionScoreCalculator.js';

/**
 * Known application identifiers with pre-configured weight profiles.
 */
export type KnownApplication = 'thingstead' | 'process-swarm';

const APPLICATION_WEIGHTS: Record<KnownApplication, WeightConfig> = {
  /**
   * Thingstead emphasizes acceptance, correction burden, and unsupported claims.
   * Content quality and reliability are paramount.
   */
  thingstead: {
    acceptance: 3.0,
    'correction-burden': 2.5,
    'unsupported-claims': 2.5,
    'schema-compliance': 1.0,
    latency: 1.0,
    cost: 1.0,
  },

  /**
   * Process Swarm emphasizes acceptance and latency.
   * Speed and successful completion are paramount.
   */
  'process-swarm': {
    acceptance: 3.0,
    latency: 2.5,
    'schema-compliance': 1.5,
    'correction-burden': 1.0,
    'unsupported-claims': 1.0,
    cost: 1.0,
  },
};

/**
 * Default equal-weight configuration used for unknown applications.
 */
const DEFAULT_WEIGHTS: WeightConfig = {
  acceptance: 1.0,
  'schema-compliance': 1.0,
  'correction-burden': 1.0,
  latency: 1.0,
  cost: 1.0,
  'unsupported-claims': 1.0,
};

/**
 * Resolves the weight configuration for a given application.
 *
 * @param application - The application name (case-insensitive for known applications).
 * @returns A WeightConfig for the application. Returns default equal weights if unknown.
 */
export function resolveApplicationWeights(application: string): WeightConfig {
  const normalized = application.toLowerCase() as KnownApplication;
  return APPLICATION_WEIGHTS[normalized] ?? { ...DEFAULT_WEIGHTS };
}
