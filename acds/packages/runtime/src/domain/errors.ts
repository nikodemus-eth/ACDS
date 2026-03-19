/**
 * Reason codes for all domain errors.
 * Every code is a unique string constant.
 */
export const ReasonCode = {
  METHOD_UNRESOLVED: "METHOD_UNRESOLVED",
  METHOD_NOT_AVAILABLE: "METHOD_NOT_AVAILABLE",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  POLICY_BLOCKED: "POLICY_BLOCKED",
  INVALID_REGISTRATION: "INVALID_REGISTRATION",
  INVALID_EXECUTION_PLAN: "INVALID_EXECUTION_PLAN",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  CROSS_CLASS_FALLBACK_BLOCKED: "CROSS_CLASS_FALLBACK_BLOCKED",
  SESSION_RISK_UNACKNOWLEDGED: "SESSION_RISK_UNACKNOWLEDGED",
} as const;

export type ReasonCodeValue = (typeof ReasonCode)[keyof typeof ReasonCode];

/**
 * Base error for all ACDS domain failures.
 */
export class AcdsError extends Error {
  readonly reason: ReasonCodeValue;

  constructor(reason: ReasonCodeValue, message: string) {
    super(message);
    this.name = "AcdsError";
    this.reason = reason;
  }
}

export class MethodUnresolvedError extends AcdsError {
  constructor(methodId: string) {
    super(ReasonCode.METHOD_UNRESOLVED, `Method not resolved: ${methodId}`);
    this.name = "MethodUnresolvedError";
  }
}

export class MethodNotAvailableError extends AcdsError {
  constructor(methodId: string) {
    super(ReasonCode.METHOD_NOT_AVAILABLE, `Method not available: ${methodId}`);
    this.name = "MethodNotAvailableError";
  }
}

export class ProviderUnavailableError extends AcdsError {
  constructor(providerId: string) {
    super(ReasonCode.PROVIDER_UNAVAILABLE, `Provider unavailable: ${providerId}`);
    this.name = "ProviderUnavailableError";
  }
}

export class PolicyBlockedError extends AcdsError {
  constructor(message: string) {
    super(ReasonCode.POLICY_BLOCKED, message);
    this.name = "PolicyBlockedError";
  }
}

export class InvalidRegistrationError extends AcdsError {
  constructor(message: string) {
    super(ReasonCode.INVALID_REGISTRATION, message);
    this.name = "InvalidRegistrationError";
  }
}

export class InvalidExecutionPlanError extends AcdsError {
  constructor(message: string) {
    super(ReasonCode.INVALID_EXECUTION_PLAN, message);
    this.name = "InvalidExecutionPlanError";
  }
}

export class ValidationFailedError extends AcdsError {
  constructor(message: string) {
    super(ReasonCode.VALIDATION_FAILED, message);
    this.name = "ValidationFailedError";
  }
}

export class CrossClassFallbackBlockedError extends AcdsError {
  constructor(message: string) {
    super(ReasonCode.CROSS_CLASS_FALLBACK_BLOCKED, message);
    this.name = "CrossClassFallbackBlockedError";
  }
}

export class SessionRiskUnacknowledgedError extends AcdsError {
  constructor(message: string) {
    super(ReasonCode.SESSION_RISK_UNACKNOWLEDGED, message);
    this.name = "SessionRiskUnacknowledgedError";
  }
}
