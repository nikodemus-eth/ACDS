/**
 * StagedExecutionRunner - Orchestrates the sequential execution of a
 * multi-stage plan, aggregating results according to the plan's strategy.
 */

import type { StagedExecutionPlan, ExecutionStage } from './StagedExecutionPlan.js';

export interface StageExecutor {
  execute(stage: ExecutionStage, input: unknown): Promise<StageResult>;
}

export interface StageResult {
  stageName: string;
  output: unknown;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface StagedExecutionResult {
  planId: string;
  success: boolean;
  stageResults: StageResult[];
  finalOutput: unknown;
  totalLatencyMs: number;
  failedAtStage?: string;
}

export class StagedExecutionRunner {
  constructor(private readonly executor: StageExecutor) {}

  /**
   * Executes all stages in order. If any stage fails, execution stops
   * and the result is marked as failed.
   */
  async run(plan: StagedExecutionPlan, initialInput: unknown): Promise<StagedExecutionResult> {
    const stageResults: StageResult[] = [];
    let currentInput = initialInput;
    let totalLatencyMs = 0;

    for (const stage of plan.stages) {
      const stageInput = stage.inputTransform ? stage.inputTransform(currentInput) : currentInput;
      const result = await this.executor.execute(stage, stageInput);
      stageResults.push(result);
      totalLatencyMs += result.latencyMs;

      if (!result.success) {
        return {
          planId: plan.id,
          success: false,
          stageResults,
          finalOutput: null,
          totalLatencyMs,
          failedAtStage: stage.name,
        };
      }

      currentInput = result.output;
    }

    return {
      planId: plan.id,
      success: true,
      stageResults,
      finalOutput: this.aggregate(plan, stageResults),
      totalLatencyMs,
    };
  }

  private aggregate(plan: StagedExecutionPlan, results: StageResult[]): unknown {
    switch (plan.aggregationStrategy) {
      case 'last_stage':
        return results[results.length - 1]?.output ?? null;
      case 'concatenate':
        return results.map(r => r.output).join('\n');
      case 'structured_merge':
        return Object.assign({}, ...results.map(r => r.output as Record<string, unknown>));
      default:
        return results[results.length - 1]?.output ?? null;
    }
  }
}
