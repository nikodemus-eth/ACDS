/**
 * Source class taxonomy — the core discriminant that separates
 * Providers, Capabilities, and Sessions.
 *
 * These three classes have different governance, routing,
 * fallback, and risk profiles. They must never be collapsed.
 */

export type SourceClass = 'provider' | 'capability' | 'session';

/**
 * Base fields shared by all source definitions.
 */
export interface SourceBase {
  /** Unique identifier for this source. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Discriminant field. */
  sourceClass: SourceClass;
}

/**
 * Provider: deterministic, locally controlled or self-hosted,
 * routable by default, health-checkable, no user-bound identity.
 */
export interface ProviderDefinition extends SourceBase {
  sourceClass: 'provider';
  /** Whether this provider produces deterministic results. */
  deterministic: boolean;
  /** Whether execution is local-only (no network). */
  localOnly: boolean;
  /** Provider sub-classification. */
  providerClass: 'sovereign_runtime' | 'self_hosted' | 'managed_local';
  /** Execution mode for this provider. */
  executionMode: 'local' | 'controlled_remote';
}

/**
 * Capability: externally governed, non-deterministic,
 * explicitly invoked only, isolated execution path, never default.
 */
export interface CapabilityDefinition extends SourceBase {
  sourceClass: 'capability';
  /** Capabilities are never deterministic. */
  deterministic: false;
  /** Must be explicitly requested — never chosen by default routing. */
  explicitInvocationRequired: true;
  /** The external vendor or service name. */
  vendor: string;
}

/**
 * Session: user-bound auth context, high risk,
 * explicit invocation only, risk acknowledgment required, never default.
 */
export interface SessionDefinition extends SourceBase {
  sourceClass: 'session';
  /** Must be explicitly requested. */
  explicitInvocationRequired: true;
  /** Risk level classification. */
  riskLevel: 'high' | 'critical';
  /** Whether this session requires explicit risk acknowledgment. */
  requiresRiskAcknowledgment: true;
  /** The capability or vendor this session authenticates against. */
  boundTo: string;
}

/**
 * Discriminated union of all source definitions.
 */
export type SourceDefinition = ProviderDefinition | CapabilityDefinition | SessionDefinition;
