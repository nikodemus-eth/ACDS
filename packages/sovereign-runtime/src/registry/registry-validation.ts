import type { SourceDefinition } from '../domain/source-types.js';
import type { MethodDefinition } from '../domain/method-registry.js';
import { InvalidRegistrationError } from '../domain/errors.js';

/**
 * Validates that a source definition is internally consistent.
 * Throws InvalidRegistrationError on any inconsistency.
 */
export function validateSourceDefinition(source: SourceDefinition): void {
  const candidate = source as Partial<{
    id: string;
    name: string;
    sourceClass: string;
    deterministic: boolean;
    localOnly: boolean;
    explicitInvocationRequired: boolean;
    requiresRiskAcknowledgment: boolean;
    riskLevel: string;
  }>;

  if (!candidate.id || candidate.id.trim() === '') {
    throw new InvalidRegistrationError('Source ID must be a non-empty string', {
      sourceClass: candidate.sourceClass,
    });
  }

  if (!candidate.name || candidate.name.trim() === '') {
    throw new InvalidRegistrationError('Source name must be a non-empty string', {
      sourceId: candidate.id,
    });
  }

  switch (candidate.sourceClass) {
    case 'provider':
      // Providers must declare determinism and locality
      if (typeof candidate.deterministic !== 'boolean') {
        throw new InvalidRegistrationError('Provider must declare deterministic flag', {
          sourceId: candidate.id,
        });
      }
      if (typeof candidate.localOnly !== 'boolean') {
        throw new InvalidRegistrationError('Provider must declare localOnly flag', {
          sourceId: candidate.id,
        });
      }
      break;

    case 'capability':
      // Capabilities must be non-deterministic and explicit-only
      if (candidate.deterministic !== false) {
        throw new InvalidRegistrationError('Capability must have deterministic=false', {
          sourceId: candidate.id,
        });
      }
      if (candidate.explicitInvocationRequired !== true) {
        throw new InvalidRegistrationError('Capability must require explicit invocation', {
          sourceId: candidate.id,
        });
      }
      break;

    case 'session':
      // Sessions must require risk acknowledgment
      if (candidate.requiresRiskAcknowledgment !== true) {
        throw new InvalidRegistrationError('Session must require risk acknowledgment', {
          sourceId: candidate.id,
        });
      }
      if (!candidate.riskLevel) {
        throw new InvalidRegistrationError('Session must declare riskLevel', {
          sourceId: candidate.id,
        });
      }
      break;

    default:
      throw new InvalidRegistrationError(
        `Unknown source class: ${String(candidate.sourceClass)}`,
      );
  }
}

/**
 * Validates that a method belongs to the correct provider and
 * has all required metadata.
 */
export function validateMethodBinding(
  method: MethodDefinition,
  source: SourceDefinition,
): void {
  if (source.sourceClass !== 'provider') {
    throw new InvalidRegistrationError(
      `Methods can only be bound to providers, not ${source.sourceClass}`,
      { methodId: method.methodId, sourceId: source.id },
    );
  }

  if (method.providerId !== source.id) {
    throw new InvalidRegistrationError(
      `Method ${method.methodId} declares providerId=${method.providerId} but is being bound to ${source.id}`,
      { methodId: method.methodId, sourceId: source.id },
    );
  }

  if (!method.methodId || method.methodId.trim() === '') {
    throw new InvalidRegistrationError('Method ID must be a non-empty string', {
      providerId: source.id,
    });
  }

  if (!method.subsystem) {
    throw new InvalidRegistrationError('Method must declare a subsystem', {
      methodId: method.methodId,
    });
  }

  if (!method.policyTier) {
    throw new InvalidRegistrationError('Method must declare a policy tier', {
      methodId: method.methodId,
    });
  }

  if (typeof method.deterministic !== 'boolean') {
    throw new InvalidRegistrationError('Method must declare deterministic flag', {
      methodId: method.methodId,
    });
  }

  if (typeof method.requiresNetwork !== 'boolean') {
    throw new InvalidRegistrationError('Method must declare requiresNetwork flag', {
      methodId: method.methodId,
    });
  }
}

/**
 * Validates that a local runtime (localOnly=true provider) is not
 * being registered with a session-class source type.
 */
export function rejectMixedClassRegistration(
  source: SourceDefinition,
  declaredClass: string,
): void {
  if (source.sourceClass !== declaredClass) {
    throw new InvalidRegistrationError(
      `Source ${source.id} has sourceClass=${source.sourceClass} but was registered as ${declaredClass}`,
      { sourceId: source.id, declaredClass, actualClass: source.sourceClass },
    );
  }
}
