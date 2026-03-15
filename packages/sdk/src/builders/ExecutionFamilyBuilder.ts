import type { ExecutionFamily } from '@acds/core-types';
import { DecisionPosture, CognitiveGrade } from '@acds/core-types';
import { DispatchRequestError } from '../errors/DispatchRequestError.js';

/**
 * Fluent builder for constructing an {@link ExecutionFamily} identity.
 *
 * An execution family groups related executions by their application,
 * process, step, posture, and cognitive grade.
 */
export class ExecutionFamilyBuilder {
  private application?: string;
  private process?: string;
  private step?: string;
  private decisionPosture?: DecisionPosture;
  private cognitiveGrade?: CognitiveGrade;

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

  withPosture(dp: DecisionPosture): this {
    this.decisionPosture = dp;
    return this;
  }

  withGrade(cg: CognitiveGrade): this {
    this.cognitiveGrade = cg;
    return this;
  }

  /**
   * Validate accumulated state and produce an {@link ExecutionFamily}.
   * Throws {@link DispatchRequestError} when required fields are missing.
   */
  build(): ExecutionFamily {
    const errors: string[] = [];

    if (!this.application) errors.push('application is required');
    if (!this.process) errors.push('process is required');
    if (!this.step) errors.push('step is required');
    if (!this.decisionPosture) errors.push('decisionPosture is required');
    if (!this.cognitiveGrade) errors.push('cognitiveGrade is required');

    if (errors.length > 0) {
      throw new DispatchRequestError(
        `ExecutionFamily validation failed: ${errors.join('; ')}`,
        errors,
      );
    }

    return {
      application: this.application!,
      process: this.process!,
      step: this.step!,
      decisionPosture: this.decisionPosture!,
      cognitiveGrade: this.cognitiveGrade!,
    };
  }
}
