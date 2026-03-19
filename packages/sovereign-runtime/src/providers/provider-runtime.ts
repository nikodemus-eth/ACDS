/**
 * Provider Runtime interface — the contract every provider adapter must implement.
 *
 * This is the boundary between ACDS routing and platform-specific execution.
 * Apple, Ollama, LMStudio, etc. each implement this interface.
 */
export interface ProviderRuntime {
  /** Unique provider ID matching the registry entry. */
  readonly providerId: string;

  /**
   * Execute a method with the given input.
   * Returns a structured result or throws a typed error.
   */
  execute(methodId: string, input: unknown): Promise<MethodExecutionResult>;

  /** Check if this provider runtime is currently available. */
  isAvailable(): Promise<boolean>;

  /** Perform a health check and return status. */
  healthCheck(): Promise<ProviderHealthResult>;
}

export interface MethodExecutionResult {
  /** The method output payload. */
  output: unknown;
  /** Execution latency in milliseconds. */
  latencyMs: number;
  /** Whether the result is deterministic. */
  deterministic: boolean;
  /** The execution mode used. */
  executionMode: 'local' | 'controlled_remote';
}

export interface ProviderHealthResult {
  status: 'healthy' | 'degraded' | 'unavailable';
  latencyMs: number;
  details?: Record<string, unknown>;
}
