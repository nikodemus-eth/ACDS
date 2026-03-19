/**
 * Apple Runtime Adapter — Implements ProviderRuntime for Apple Intelligence.
 *
 * Dispatches method execution to the correct subsystem handler,
 * measures latency, and returns structured MethodExecutionResult.
 */
import type { ProviderRuntime, MethodExecutionResult, HealthStatus } from "../provider-runtime.js";
import type { ApplePlatformBundle } from "./apple-interfaces.js";
import { buildAppleMethodHandlers, type AppleMethodHandler } from "./apple-method-registry.js";
import { MethodNotAvailableError } from "../../domain/errors.js";

export class AppleRuntimeAdapter implements ProviderRuntime {
  readonly provider_id = "apple-intelligence-runtime";

  private readonly handlers: Map<string, AppleMethodHandler>;
  private healthState: HealthStatus;

  constructor(bundle: ApplePlatformBundle) {
    this.handlers = buildAppleMethodHandlers(bundle);
    this.healthState = {
      state: "healthy",
      message: "All Apple Intelligence subsystems operational",
      checked_at: Date.now(),
    };
  }

  health(): HealthStatus {
    return this.healthState;
  }

  /**
   * Update health state (useful for testing degraded/unavailable scenarios).
   */
  setHealth(state: HealthStatus["state"], message?: string): void {
    this.healthState = {
      state,
      message,
      checked_at: Date.now(),
    };
  }

  supports(method_id: string): boolean {
    return this.handlers.has(method_id);
  }

  async execute(method_id: string, input: unknown): Promise<MethodExecutionResult> {
    const handler = this.handlers.get(method_id);
    if (!handler) {
      throw new MethodNotAvailableError(method_id);
    }

    const start = performance.now();
    const output = await handler(method_id, input);
    const latency_ms = Math.round((performance.now() - start) * 100) / 100;

    return {
      output,
      latency_ms,
      deterministic: true,
      execution_mode: "local",
    };
  }
}
