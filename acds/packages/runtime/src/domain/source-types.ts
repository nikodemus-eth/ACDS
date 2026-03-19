/**
 * Discriminated union for source classes.
 *
 * Every source in the ACDS runtime belongs to exactly one class.
 * The `source_class` field is the discriminant.
 */

// ---------------------------------------------------------------------------
// Source class literal type
// ---------------------------------------------------------------------------
export type SourceClass = "provider" | "capability" | "session";

// ---------------------------------------------------------------------------
// Provider source
// ---------------------------------------------------------------------------
/**
 * Deterministic by default, locally controlled, routable, health-checkable.
 */
export interface ProviderSource {
  readonly source_class: "provider";
  /** Deterministic output guaranteed (default: true). */
  readonly deterministic: boolean;
  /** Can be selected by the router as a default target. */
  readonly routable: boolean;
  /** Supports health-check probes. */
  readonly health_checkable: boolean;
  /** Execution stays on-device or within a controlled perimeter. */
  readonly locally_controlled: boolean;
}

/**
 * Construct a ProviderSource with sensible sovereign defaults.
 */
export function providerSourceDefaults(
  overrides?: Partial<Omit<ProviderSource, "source_class">>,
): ProviderSource {
  return {
    source_class: "provider",
    deterministic: true,
    routable: true,
    health_checkable: true,
    locally_controlled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Capability source
// ---------------------------------------------------------------------------
/**
 * Externally governed, non-deterministic, explicit invocation only, never default.
 */
export interface CapabilitySource {
  readonly source_class: "capability";
  /** Must be invoked explicitly -- never selected as default. */
  readonly explicit_invocation: boolean;
  /** Externally governed (not under local control). */
  readonly externally_governed: boolean;
  /** Output is non-deterministic. */
  readonly non_deterministic: boolean;
}

/**
 * Construct a CapabilitySource with mandatory explicit-invocation semantics.
 */
export function capabilitySourceDefaults(
  overrides?: Partial<Omit<CapabilitySource, "source_class">>,
): CapabilitySource {
  return {
    source_class: "capability",
    explicit_invocation: true,
    externally_governed: true,
    non_deterministic: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Session source
// ---------------------------------------------------------------------------
/**
 * User-bound auth, high risk, explicit risk acknowledgment required, never default.
 */
export interface SessionSource {
  readonly source_class: "session";
  /** Bound to a specific user authentication context. */
  readonly user_bound: boolean;
  /** Carries inherent risk that must be acknowledged. */
  readonly high_risk: boolean;
  /** The caller must explicitly acknowledge risk before use. */
  readonly risk_acknowledged: boolean;
}

/**
 * Construct a SessionSource. risk_acknowledged defaults to false
 * because the caller must explicitly opt-in.
 */
export function sessionSourceDefaults(
  overrides?: Partial<Omit<SessionSource, "source_class">>,
): SessionSource {
  return {
    source_class: "session",
    user_bound: true,
    high_risk: true,
    risk_acknowledged: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------
export type Source = ProviderSource | CapabilitySource | SessionSource;
