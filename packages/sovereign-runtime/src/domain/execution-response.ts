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
    /** Estimated cost of this execution in USD. */
    costUSD?: number;
    /** Token counts for input and output if applicable. */
    tokenCount?: { input: number; output: number };
  };
  /** Routing decision metadata for observability. */
  decision?: {
    /** Number of providers considered eligible. */
    eligibleProviders: number;
    /** Reason the selected provider was chosen. */
    selectedReason: string;
    /** Whether a fallback provider is available. */
    fallbackAvailable: boolean;
    /** Names of policies applied during routing. */
    policyApplied: string[];
  };
}
