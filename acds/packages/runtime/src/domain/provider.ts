/**
 * Provider-specific domain types.
 */

export type HealthStatus = "healthy" | "degraded" | "unavailable";

export type ExecutionMode = "local" | "controlled_remote";

export type ProviderClass = "sovereign_runtime" | "local_runtime" | "controlled_remote_runtime";

export interface ProviderDescriptor {
  readonly provider_id: string;
  readonly display_name: string;
  readonly provider_class: ProviderClass;
  readonly execution_mode: ExecutionMode;
  readonly deterministic: boolean;
  readonly health_status: HealthStatus;
  /** Subsystems this provider exposes (e.g. "text", "speech_in"). */
  readonly subsystems: readonly string[];
}
