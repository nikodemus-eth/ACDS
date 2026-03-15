import { DispatchRequestError } from '../errors/DispatchRequestError.js';

/**
 * Structured process context describing where within an application
 * an execution takes place, along with arbitrary extra metadata.
 */
export interface ProcessContext {
  application: string;
  process: string;
  step: string;
  extra: Record<string, unknown>;
}

/**
 * Fluent builder for packaging process metadata into a {@link ProcessContext}.
 */
export class ProcessContextBuilder {
  private application?: string;
  private process?: string;
  private step?: string;
  private extra: Record<string, unknown> = {};

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

  /**
   * Merge additional key-value pairs into the extra metadata bag.
   * Successive calls are additive; later values for the same key overwrite earlier ones.
   */
  withExtra(extra: Record<string, unknown>): this {
    this.extra = { ...this.extra, ...extra };
    return this;
  }

  /**
   * Validate and produce a {@link ProcessContext}.
   * Throws {@link DispatchRequestError} when required fields are missing.
   */
  build(): ProcessContext {
    const errors: string[] = [];

    if (!this.application) errors.push('application is required');
    if (!this.process) errors.push('process is required');
    if (!this.step) errors.push('step is required');

    if (errors.length > 0) {
      throw new DispatchRequestError(
        `ProcessContext validation failed: ${errors.join('; ')}`,
        errors,
      );
    }

    return {
      application: this.application!,
      process: this.process!,
      step: this.step!,
      extra: { ...this.extra },
    };
  }
}
