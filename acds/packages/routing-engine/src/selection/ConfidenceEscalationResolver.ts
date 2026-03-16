/**
 * ConfidenceEscalationResolver - Determines whether an execution should
 * be escalated to a higher cognitive grade based on confidence scores.
 */

import { CognitiveGrade } from '@acds/core-types';

export interface ConfidenceEscalationConfig {
  /** Below this threshold, escalate to frontier tier (default 0.3). */
  frontierThreshold: number;
  /** Below this threshold, escalate to enhanced tier (default 0.6). */
  enhancedThreshold: number;
  /** Below this threshold, use standard tier (default 0.8). */
  standardThreshold: number;
}

const DEFAULT_CONFIG: ConfidenceEscalationConfig = {
  frontierThreshold: 0.3,
  enhancedThreshold: 0.6,
  standardThreshold: 0.8,
};

export class ConfidenceEscalationResolver {
  private readonly config: ConfidenceEscalationConfig;

  constructor(config?: Partial<ConfidenceEscalationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Resolves the recommended cognitive grade for a given confidence level.
   * Lower confidence results in a higher-tier recommendation.
   */
  resolve(confidence: number): CognitiveGrade {
    if (confidence < this.config.frontierThreshold) return CognitiveGrade.FRONTIER;
    if (confidence < this.config.enhancedThreshold) return CognitiveGrade.ENHANCED;
    if (confidence < this.config.standardThreshold) return CognitiveGrade.STANDARD;
    return CognitiveGrade.BASIC;
  }

  /**
   * Determines whether escalation is warranted by comparing the recommended
   * grade against the current grade.
   */
  shouldEscalate(confidence: number, currentGrade: CognitiveGrade): boolean {
    const recommended = this.resolve(confidence);
    const gradeOrder = [
      CognitiveGrade.BASIC,
      CognitiveGrade.STANDARD,
      CognitiveGrade.ENHANCED,
      CognitiveGrade.FRONTIER,
      CognitiveGrade.SPECIALIZED,
    ];
    return gradeOrder.indexOf(recommended) > gradeOrder.indexOf(currentGrade);
  }
}
