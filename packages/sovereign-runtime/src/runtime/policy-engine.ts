import type { ACDSMethodRequest } from '../domain/execution-request.js';
import type { MethodDefinition } from '../domain/method-registry.js';
import type { SourceRegistry } from '../registry/registry.js';
import type { SourceDefinition, SourceClass } from '../domain/source-types.js';
import { PolicyTier, SOVEREIGN_ALLOWED_TIERS } from '../domain/policy-tiers.js';
import { PolicyBlockedError } from '../domain/errors.js';

export interface PolicyDecision {
  allowed: boolean;
  /** The reason code if blocked. */
  reason?: string;
  /** The source class of the execution path. */
  executionClass: SourceClass;
  /** Additional details for audit logging. */
  details?: Record<string, unknown>;
}

/**
 * Evaluates whether a request is allowed to proceed given the
 * resolved method, the registry state, and the request constraints.
 *
 * This is a pure function — it reads state but never mutates it.
 */
export function evaluatePolicy(
  request: ACDSMethodRequest,
  method: MethodDefinition,
  registry: SourceRegistry,
  isOverride: boolean,
): PolicyDecision {
  // 1. If explicit capability override, require explicit approval
  if (request.useCapability) {
    const capSource = registry.getSource(request.useCapability);
    if (!capSource || capSource.sourceClass !== 'capability') {
      return blocked('Requested capability not found in registry', {
        capabilityId: request.useCapability,
      }, 'capability');
    }

    // local_only constraint blocks any capability
    if (request.constraints?.localOnly) {
      return blocked('Capability invocation blocked by local_only constraint', {
        capabilityId: request.useCapability,
      }, 'capability');
    }

    // Capabilities must be explicitly approved (the mere presence of useCapability is approval)
    return allowed('capability');
  }

  // 2. If explicit session, require risk acknowledgment
  if (request.useSession) {
    const sessionSource = registry.getSource(request.useSession);
    if (!sessionSource || sessionSource.sourceClass !== 'session') {
      return blocked('Requested session not found in registry', {
        sessionId: request.useSession,
      }, 'session');
    }

    if (!request.riskAcknowledged) {
      return blocked('Session invocation requires explicit risk acknowledgment', {
        sessionId: request.useSession,
      }, 'session');
    }

    // local_only constraint blocks any session
    if (request.constraints?.localOnly) {
      return blocked('Session invocation blocked by local_only constraint', {
        sessionId: request.useSession,
      }, 'session');
    }

    return allowed('session');
  }

  // 3. Default provider path — check method policy tier
  const source = registry.getSource(method.providerId);
  if (!source || source.sourceClass !== 'provider') {
    return blocked('Method provider not found or is not a provider', {
      providerId: method.providerId,
    });
  }

  // 4. Tier D methods blocked in sovereign mode (local_only)
  if (request.constraints?.localOnly && !SOVEREIGN_ALLOWED_TIERS.has(method.policyTier)) {
    return blocked('Tier D method blocked in local-only sovereign mode', {
      methodId: method.methodId,
      policyTier: method.policyTier,
    });
  }

  // 5. Methods requiring network blocked under local_only
  if (request.constraints?.localOnly && method.requiresNetwork) {
    return blocked('Method requires network but local_only constraint is set', {
      methodId: method.methodId,
    });
  }

  return allowed('provider');
}

/**
 * Validates that a fallback does not cross class boundaries.
 */
export function validateFallbackClass(
  primaryClass: SourceClass,
  fallbackProviderId: string,
  registry: SourceRegistry,
): PolicyDecision {
  const fallbackSource = registry.getSource(fallbackProviderId);
  if (!fallbackSource) {
    return blocked('Fallback source not found in registry', { fallbackProviderId });
  }

  if (fallbackSource.sourceClass !== primaryClass) {
    return blocked(
      `Cross-class fallback rejected: primary=${primaryClass}, fallback=${fallbackSource.sourceClass}`,
      { primaryClass, fallbackClass: fallbackSource.sourceClass, fallbackProviderId },
    );
  }

  return allowed(primaryClass);
}

function allowed(executionClass: SourceClass): PolicyDecision {
  return { allowed: true, executionClass };
}

function blocked(reason: string, details?: Record<string, unknown>, executionClass: SourceClass = 'provider'): PolicyDecision {
  return { allowed: false, reason, executionClass, details };
}
