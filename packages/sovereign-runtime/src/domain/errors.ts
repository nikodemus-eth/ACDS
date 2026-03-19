/**
 * Reason codes for all runtime errors.
 * Every denial, failure, and rejection carries a code.
 */
export type ErrorReasonCode =
  | 'METHOD_UNRESOLVED'
  | 'METHOD_NOT_AVAILABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'POLICY_BLOCKED'
  | 'INVALID_REGISTRATION'
  | 'INVALID_EXECUTION_PLAN'
  | 'VALIDATION_FAILED';

/**
 * Base runtime error with a typed reason code.
 */
export class ACDSRuntimeError extends Error {
  public readonly code: ErrorReasonCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorReasonCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ACDSRuntimeError';
    this.code = code;
    this.details = details;
  }
}

export class MethodUnresolvedError extends ACDSRuntimeError {
  constructor(intent: string) {
    super('METHOD_UNRESOLVED', `No method resolved for intent: ${intent}`, { intent });
  }
}

export class MethodNotAvailableError extends ACDSRuntimeError {
  constructor(methodId: string, providerId: string) {
    super('METHOD_NOT_AVAILABLE', `Method ${methodId} is not available on provider ${providerId}`, {
      methodId,
      providerId,
    });
  }
}

export class ProviderUnavailableError extends ACDSRuntimeError {
  constructor(providerId: string) {
    super('PROVIDER_UNAVAILABLE', `Provider ${providerId} is unavailable`, { providerId });
  }
}

export class PolicyBlockedError extends ACDSRuntimeError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super('POLICY_BLOCKED', reason, details);
  }
}

export class InvalidRegistrationError extends ACDSRuntimeError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super('INVALID_REGISTRATION', reason, details);
  }
}

export class InvalidExecutionPlanError extends ACDSRuntimeError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super('INVALID_EXECUTION_PLAN', reason, details);
  }
}

export class ValidationFailedError extends ACDSRuntimeError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super('VALIDATION_FAILED', reason, details);
  }
}
