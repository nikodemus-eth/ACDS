/**
 * Generic ProviderRuntime interface.
 *
 * Every provider in the ACDS runtime implements this contract.
 * The orchestrator dispatches through it without knowing the provider's internals.
 */

// ---------------------------------------------------------------------------
// Health status
// ---------------------------------------------------------------------------
export type HealthState = "healthy" | "degraded" | "unavailable";

export interface HealthStatus {
  readonly state: HealthState;
  readonly message?: string;
  readonly checked_at: number;
}

// ---------------------------------------------------------------------------
// Execution result
// ---------------------------------------------------------------------------
export interface MethodExecutionResult {
  output: unknown;
  latency_ms: number;
  deterministic: boolean;
  execution_mode: "local" | "controlled_remote";
}

// ---------------------------------------------------------------------------
// Provider runtime contract
// ---------------------------------------------------------------------------
export interface ProviderRuntime {
  readonly provider_id: string;
  health(): HealthStatus;
  supports(method_id: string): boolean;
  execute(method_id: string, input: unknown): Promise<MethodExecutionResult>;
}
