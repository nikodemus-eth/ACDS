import type { SourceDefinition } from '../domain/source-types.js';
import type { MethodDefinition } from '../domain/method-registry.js';
import { InvalidRegistrationError } from '../domain/errors.js';

/**
 * Validates that a source definition is internally consistent.
 * Throws InvalidRegistrationError on any inconsistency.
 */
export function validateSourceDefinition(source: SourceDefinition): void {
  if (!source.id || source.id.trim() === '') {
    throw new InvalidRegistrationError('Source ID must be a non-empty string', {
      sourceClass: source.sourceClass,
    });
  }

  if (!source.name || source.name.trim() === '') {
    throw new InvalidRegistrationError('Source name must be a non-empty string', {
      sourceId: source.id,
    });
  }

  switch (source.sourceClass) {
    case 'provider':
      // Providers must declare determinism and locality
      if (typeof source.deterministic !== 'boolean') {
        throw new InvalidRegistrationError('Provider must declare deterministic flag', {
          sourceId: source.id,
        });
      }
      if (typeof source.localOnly !== 'boolean') {
        throw new InvalidRegistrationError('Provider must declare localOnly flag', {
          sourceId: source.id,
        });
      }
      break;

    case 'capability':
      // Capabilities must be non-deterministic and explicit-only
      if (source.deterministic !== false) {
        throw new InvalidRegistrationError('Capability must have deterministic=false', {
          sourceId: source.id,
        });
      }
      if (source.explicitInvocationRequired !== true) {
        throw new InvalidRegistrationError('Capability must require explicit invocation', {
          sourceId: source.id,
        });
      }
      break;

    case 'session':
      // Sessions must require risk acknowledgment
      if (source.requiresRiskAcknowledgment !== true) {
        throw new InvalidRegistrationError('Session must require risk acknowledgment', {
          sourceId: source.id,
        });
      }
      if (!source.riskLevel) {
        throw new InvalidRegistrationError('Session must declare riskLevel', {
          sourceId: source.id,
        });
      }
      break;

    default:
      throw new InvalidRegistrationError(
        `Unknown source class: ${(source as SourceDefinition).sourceClass}`,
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
