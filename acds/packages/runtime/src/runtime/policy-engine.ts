/**
 * Policy Engine — Evaluates policy before execution.
 *
 * Takes a resolved method + registry + constraints and decides
 * whether the execution is allowed.
 */
import type { Registry } from "../registry/registry.js";
import type { ResolvedMethod } from "./method-resolver.js";
import type { SourceClass } from "../domain/source-types.js";
import { PolicyTier } from "../domain/policy-tiers.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------
export interface PolicyConstraints {
  local_only?: boolean;
  explicit_approval?: boolean;
  risk_acknowledged?: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  reason_code: string;
  details: string;
  source_class: SourceClass;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
export function evaluatePolicy(
  resolved: ResolvedMethod,
  registry: Registry,
  constraints: PolicyConstraints,
): PolicyDecision {
  const { source_class } = resolved;

  // -------------------------------------------------------------------------
  // Capability path
  // -------------------------------------------------------------------------
  if (source_class === "capability") {
    if (constraints.local_only) {
      return {
        allowed: false,
        reason_code: "LOCAL_ONLY_BLOCKS_CAPABILITY",
        details: "local_only constraint blocks capability path",
        source_class,
      };
    }
    if (!constraints.explicit_approval) {
      return {
        allowed: false,
        reason_code: "CAPABILITY_REQUIRES_APPROVAL",
        details: "Capability requires explicit_approval in request",
        source_class,
      };
    }
    return {
      allowed: true,
      reason_code: "CAPABILITY_APPROVED",
      details: "Capability path approved with explicit approval",
      source_class,
    };
  }

  // -------------------------------------------------------------------------
  // Session path
  // -------------------------------------------------------------------------
  if (source_class === "session") {
    if (constraints.local_only) {
      return {
        allowed: false,
        reason_code: "LOCAL_ONLY_BLOCKS_SESSION",
        details: "local_only constraint blocks session path",
        source_class,
      };
    }
    if (!constraints.risk_acknowledged) {
      return {
        allowed: false,
        reason_code: "SESSION_RISK_UNACKNOWLEDGED",
        details: "Session requires risk_acknowledged in request",
        source_class,
      };
    }
    return {
      allowed: true,
      reason_code: "SESSION_APPROVED",
      details: "Session path approved with risk acknowledgment",
      source_class,
    };
  }

  // -------------------------------------------------------------------------
  // Provider path
  // -------------------------------------------------------------------------
  const method = registry.getMethod(resolved.method_id);
  if (!method) {
    return {
      allowed: false,
      reason_code: "METHOD_NOT_FOUND",
      details: `Method ${resolved.method_id} not in registry`,
      source_class,
    };
  }

  // Tier D blocked in local-only / sovereign mode
  if (method.policy_tier === PolicyTier.D && constraints.local_only) {
    return {
      allowed: false,
      reason_code: "TIER_D_BLOCKED_SOVEREIGN",
      details: "Tier D methods blocked in sovereign/local-only mode",
      source_class,
    };
  }

  // Tier A/B/C allowed by default for provider path
  return {
    allowed: true,
    reason_code: "PROVIDER_ALLOWED",
    details: `Provider method (Tier ${method.policy_tier}) allowed`,
    source_class,
  };
}
