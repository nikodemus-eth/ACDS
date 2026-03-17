import { describe, it, expect } from 'vitest';
import { StagedExecutionRunner } from './StagedExecutionRunner.js';
import type { StageExecutor, StageResult } from './StagedExecutionRunner.js';
import type { StagedExecutionPlan, ExecutionStage } from './StagedExecutionPlan.js';

function makeStage(name: string, overrides: Partial<ExecutionStage> = {}): ExecutionStage {
  return {
    name,
    taskType: 'analytical',
    description: `Stage ${name}`,
    ...overrides,
  };
}

function makePlan(
  stages: ExecutionStage[],
  aggregationStrategy: StagedExecutionPlan['aggregationStrategy'] = 'last_stage',
): StagedExecutionPlan {
  return { id: 'plan-1', stages, aggregationStrategy };
}

class SuccessExecutor implements StageExecutor {
  calls: Array<{ stage: ExecutionStage; input: unknown }> = [];

  async execute(stage: ExecutionStage, input: unknown): Promise<StageResult> {
    this.calls.push({ stage, input });
    return {
      stageName: stage.name,
      output: `output-of-${stage.name}`,
      latencyMs: 10,
      success: true,
    };
  }
}

class FailAtStageExecutor implements StageExecutor {
  constructor(private readonly failAt: string) {}

  async execute(stage: ExecutionStage, _input: unknown): Promise<StageResult> {
    if (stage.name === this.failAt) {
      return {
        stageName: stage.name,
        output: null,
        latencyMs: 5,
        success: false,
        error: `Failed at ${stage.name}`,
      };
    }
    return {
      stageName: stage.name,
      output: `output-of-${stage.name}`,
      latencyMs: 10,
      success: true,
    };
  }
}

class StructuredExecutor implements StageExecutor {
  private counter = 0;

  async execute(stage: ExecutionStage, _input: unknown): Promise<StageResult> {
    this.counter++;
    return {
      stageName: stage.name,
      output: { [`key${this.counter}`]: `value${this.counter}` },
      latencyMs: 10,
      success: true,
    };
  }
}

describe('StagedExecutionRunner', () => {
  it('runs all stages in order and returns success', async () => {
    const executor = new SuccessExecutor();
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([makeStage('A'), makeStage('B')]);

    const result = await runner.run(plan, 'initial');

    expect(result.planId).toBe('plan-1');
    expect(result.success).toBe(true);
    expect(result.stageResults).toHaveLength(2);
    expect(result.totalLatencyMs).toBe(20);
    expect(result.failedAtStage).toBeUndefined();
  });

  it('passes output of each stage as input to the next', async () => {
    const executor = new SuccessExecutor();
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([makeStage('A'), makeStage('B')]);

    await runner.run(plan, 'initial');

    expect(executor.calls[0].input).toBe('initial');
    expect(executor.calls[1].input).toBe('output-of-A');
  });

  it('stops execution on first stage failure', async () => {
    const executor = new FailAtStageExecutor('B');
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([makeStage('A'), makeStage('B'), makeStage('C')]);

    const result = await runner.run(plan, 'initial');

    expect(result.success).toBe(false);
    expect(result.failedAtStage).toBe('B');
    expect(result.stageResults).toHaveLength(2);
    expect(result.finalOutput).toBeNull();
  });

  it('fails immediately when first stage fails', async () => {
    const executor = new FailAtStageExecutor('A');
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([makeStage('A'), makeStage('B')]);

    const result = await runner.run(plan, 'initial');

    expect(result.success).toBe(false);
    expect(result.failedAtStage).toBe('A');
    expect(result.stageResults).toHaveLength(1);
  });

  it('applies inputTransform when defined on a stage', async () => {
    const executor = new SuccessExecutor();
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([
      makeStage('A', { inputTransform: (input: unknown) => `transformed-${input}` }),
    ]);

    await runner.run(plan, 'raw');

    expect(executor.calls[0].input).toBe('transformed-raw');
  });

  it('aggregates with last_stage strategy', async () => {
    const executor = new SuccessExecutor();
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([makeStage('A'), makeStage('B')], 'last_stage');

    const result = await runner.run(plan, 'initial');

    expect(result.finalOutput).toBe('output-of-B');
  });

  it('aggregates with concatenate strategy', async () => {
    const executor = new SuccessExecutor();
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([makeStage('A'), makeStage('B')], 'concatenate');

    const result = await runner.run(plan, 'initial');

    expect(result.finalOutput).toBe('output-of-A\noutput-of-B');
  });

  it('aggregates with structured_merge strategy', async () => {
    const executor = new StructuredExecutor();
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([makeStage('A'), makeStage('B')], 'structured_merge');

    const result = await runner.run(plan, 'initial');

    expect(result.finalOutput).toEqual({ key1: 'value1', key2: 'value2' });
  });

  it('uses last_stage as default for unknown aggregation strategy', async () => {
    const executor = new SuccessExecutor();
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([makeStage('A'), makeStage('B')]);
    (plan as any).aggregationStrategy = 'unknown_strategy';

    const result = await runner.run(plan, 'initial');

    expect(result.finalOutput).toBe('output-of-B');
  });

  it('handles a plan with zero stages', async () => {
    const executor = new SuccessExecutor();
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([]);

    const result = await runner.run(plan, 'initial');

    expect(result.success).toBe(true);
    expect(result.stageResults).toHaveLength(0);
    expect(result.totalLatencyMs).toBe(0);
    // last_stage with empty results => null
    expect(result.finalOutput).toBeNull();
  });

  it('handles a plan with a single stage', async () => {
    const executor = new SuccessExecutor();
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([makeStage('Only')]);

    const result = await runner.run(plan, 'data');

    expect(result.success).toBe(true);
    expect(result.stageResults).toHaveLength(1);
    expect(result.finalOutput).toBe('output-of-Only');
  });

  it('accumulates total latency from all stages', async () => {
    const executor = new FailAtStageExecutor('C');
    const runner = new StagedExecutionRunner(executor);
    const plan = makePlan([makeStage('A'), makeStage('B'), makeStage('C')]);

    const result = await runner.run(plan, 'x');

    // A=10ms, B=10ms, C=5ms (failure)
    expect(result.totalLatencyMs).toBe(25);
  });
});
