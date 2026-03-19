/**
 * Session-specific domain types.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface AuthContext {
  readonly user_id: string;
  readonly scopes: readonly string[];
  readonly issued_at: number;
  readonly expires_at: number;
}

export interface SessionDescriptor {
  readonly session_id: string;
  readonly display_name: string;
  readonly risk_level: RiskLevel;
  readonly risk_acknowledged: boolean;
  readonly auth_context: AuthContext;
  /** ISO-8601 expiry timestamp. */
  readonly expires_at: string;
}
