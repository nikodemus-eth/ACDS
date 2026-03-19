/**
 * Structured response from ACDS method execution.
 * Every response includes metadata for observability and GRITS validation.
 */
export interface ACDSMethodResponse {
  /** The method output payload. */
  output: unknown;
  /** Execution metadata for observability and governance. */
  metadata: {
    /** Provider that executed the method. */
    providerId: string;
    /** Method that was executed. */
    methodId: string;
    /** How execution occurred. */
    executionMode: 'local' | 'controlled_remote' | 'session';
    /** Whether the execution was deterministic. */
    deterministic: boolean;
    /** Execution latency in milliseconds. */
    latencyMs: number;
    /** Whether GRITS validation passed. */
    validated: boolean;
    /** Any warnings from execution or validation. */
    warnings?: string[];
  };
}
