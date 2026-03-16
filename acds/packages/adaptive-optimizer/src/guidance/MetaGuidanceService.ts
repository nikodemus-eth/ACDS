/**
 * MetaGuidanceService - Generates strategy recommendations for execution
 * families based on plateau detection signals.
 */

import { randomUUID } from 'node:crypto';
import type { PlateauSignal } from '../plateau/PlateauSignal.js';
import type { StrategyRecommendation, StrategyType } from './StrategyRecommendation.js';

export class MetaGuidanceService {
  /**
   * Generates strategy recommendations based on plateau signal indicators.
   * Returns an empty array if the plateau severity is none or mild.
   */
  generateStrategies(familyKey: string, signal: PlateauSignal): StrategyRecommendation[] {
    const strategies: StrategyRecommendation[] = [];
    const now = new Date().toISOString();

    if (signal.severity === 'none' || signal.severity === 'mild') {
      return strategies;
    }

    if (signal.indicators.flatQuality) {
      strategies.push(this.makeStrategy(familyKey, 'change_scaffold',
        'Quality plateau detected. Consider changing the reasoning scaffold or prompt structure.', 'medium', now));
      strategies.push(this.makeStrategy(familyKey, 'enable_multi_stage',
        'Enable multi-stage pipeline to decompose the task into extraction + reasoning steps.', 'high', now));
    }

    if (signal.indicators.risingCost) {
      strategies.push(this.makeStrategy(familyKey, 'split_task',
        'Costs rising without quality gains. Split the task into smaller, cheaper sub-tasks.', 'medium', now));
    }

    if (signal.indicators.risingCorrectionBurden) {
      strategies.push(this.makeStrategy(familyKey, 'insert_critique',
        'Human correction burden increasing. Insert a self-critique step before final output.', 'high', now));
    }

    if (signal.indicators.repeatedFallbacks) {
      strategies.push(this.makeStrategy(familyKey, 'escalate_model',
        'Repeated fallbacks suggest the current model profile is inadequate. Escalate to a more capable model.', 'high', now));
    }

    if (signal.indicators.persistentUnderperformance) {
      strategies.push(this.makeStrategy(familyKey, 'escalate_model',
        'Persistent underperformance. Escalate model profile to frontier tier.', 'high', now));
      strategies.push(this.makeStrategy(familyKey, 'enable_multi_stage',
        'Consider multi-stage execution to improve quality through decomposition.', 'medium', now));
    }

    return strategies;
  }

  private makeStrategy(
    familyKey: string,
    type: StrategyType,
    description: string,
    impact: 'low' | 'medium' | 'high',
    createdAt: string,
  ): StrategyRecommendation {
    return { id: randomUUID(), familyKey, strategyType: type, description, expectedImpact: impact, createdAt };
  }
}
