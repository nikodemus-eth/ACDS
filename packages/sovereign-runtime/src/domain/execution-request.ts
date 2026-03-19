/**
 * A request to execute a specific method through the ACDS runtime.
 */
export interface ACDSMethodRequest {
  /** Target provider ID. */
  providerId: string;
  /** Target method ID. */
  methodId: string;
  /** Method input payload. */
  input: unknown;
  /** Optional execution context metadata. */
  context?: Record<string, unknown>;
  /** Execution constraints. */
  constraints?: {
    /** If true, only local providers are allowed — no capabilities or sessions. */
    localOnly?: boolean;
    /** Maximum acceptable execution latency in milliseconds. */
    maxLatencyMs?: number;
    /** Maximum cost per request in USD. */
    maxCostUSD?: number;
    /** Data sensitivity level — higher sensitivity prefers local execution. */
    sensitivity?: 'low' | 'medium' | 'high';
    /** Soft preference for a specific provider (scoring hint, not a hard constraint). */
    preferredProvider?: string;
  };
  /** Explicitly request a specific capability instead of default provider routing. */
  useCapability?: string;
  /** Explicitly request execution through a session. */
  useSession?: string;
  /** Acknowledge session-level risk. Required when useSession is set. */
  riskAcknowledged?: boolean;
}
