/**
 * ExecutionLease - Represents a time-bound, scoped authorization for
 * a provider to execute tasks within defined usage limits.
 */

export interface ExecutionLease {
  /** Unique identifier for this lease. */
  leaseId: string;
  /** The provider this lease is issued to. */
  providerId: string;
  /** Capabilities the provider is authorized to use under this lease. */
  capabilityScope: string[];
  /** When this lease expires. */
  expiresAt: Date;
  /** Usage limits enforced during the lease period. */
  usageLimits: {
    maxRequests: number;
    maxTokens: number;
  };
  /** When this lease was issued. */
  issuedAt: Date;
  /** If set, when this lease was revoked before expiry. */
  revokedAt?: Date;
}
