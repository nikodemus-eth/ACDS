import type { RoutingRequest, RoutingConstraints, InstanceContext } from '@acds/core-types';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade } from '@acds/core-types';
import { DispatchRequestError } from '../errors/DispatchRequestError.js';

/**
 * Fluent builder for constructing a valid {@link RoutingRequest}.
 *
 * Usage:
 * ```ts
 * const request = new RoutingRequestBuilder()
 *   .forApplication('my-app')
 *   .forProcess('ingestion')
 *   .forStep('classify')
 *   .withTaskType(TaskType.CLASSIFICATION)
 *   .withLoadTier(LoadTier.SINGLE_SHOT)
 *   .withPosture(DecisionPosture.ADVISORY)
 *   .withGrade(CognitiveGrade.STANDARD)
 *   .withConstraints({ ... })
 *   .build();
 * ```
 */
export class RoutingRequestBuilder {
  private application?: string;
  private process?: string;
  private step?: string;
  private taskType?: TaskType;
  private loadTier?: LoadTier;
  private decisionPosture?: DecisionPosture;
  private cognitiveGrade?: CognitiveGrade;
  private _input?: string | Record<string, unknown>;
  private constraints?: RoutingConstraints;
  private instanceContext?: InstanceContext;

  forApplication(app: string): this {
    this.application = app;
    return this;
  }

  forProcess(proc: string): this {
    this.process = proc;
    return this;
  }

  forStep(step: string): this {
    this.step = step;
    return this;
  }

  withTaskType(tt: TaskType): this {
    this.taskType = tt;
    return this;
  }

  withLoadTier(lt: LoadTier): this {
    this.loadTier = lt;
    return this;
  }

  withPosture(dp: DecisionPosture): this {
    this.decisionPosture = dp;
    return this;
  }

  withGrade(cg: CognitiveGrade): this {
    this.cognitiveGrade = cg;
    return this;
  }

  withInput(input: string | Record<string, unknown>): this {
    this._input = input;
    return this;
  }

  withConstraints(c: RoutingConstraints): this {
    this.constraints = c;
    return this;
  }

  withInstanceContext(ctx: InstanceContext): this {
    this.instanceContext = ctx;
    return this;
  }

  /**
   * Validate accumulated state and produce a {@link RoutingRequest}.
   * Throws {@link DispatchRequestError} when required fields are missing.
   */
  build(): RoutingRequest {
    const errors: string[] = [];

    if (!this.application) errors.push('application is required');
    if (!this.process) errors.push('process is required');
    if (!this.step) errors.push('step is required');
    if (!this.taskType) errors.push('taskType is required');
    if (!this.loadTier) errors.push('loadTier is required');
    if (!this.decisionPosture) errors.push('decisionPosture is required');
    if (!this.cognitiveGrade) errors.push('cognitiveGrade is required');
    if (this._input === undefined || this._input === null) errors.push('input is required');
    if (!this.constraints) errors.push('constraints is required');

    if (errors.length > 0) {
      throw new DispatchRequestError(
        `RoutingRequest validation failed: ${errors.join('; ')}`,
        errors,
      );
    }

    return {
      application: this.application!,
      process: this.process!,
      step: this.step!,
      taskType: this.taskType!,
      loadTier: this.loadTier!,
      decisionPosture: this.decisionPosture!,
      cognitiveGrade: this.cognitiveGrade!,
      input: this._input!,
      constraints: this.constraints!,
      ...(this.instanceContext ? { instanceContext: this.instanceContext } : {}),
    };
  }
}
