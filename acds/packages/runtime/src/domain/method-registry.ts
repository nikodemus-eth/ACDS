/**
 * Method definition model.
 *
 * A method is a discrete operation exposed by a provider,
 * bound to a subsystem and governed by a policy tier.
 */
import { PolicyTier } from "./policy-tiers.js";

export interface MethodDefinition {
  readonly method_id: string;
  readonly provider_id: string;
  readonly subsystem: string;
  readonly deterministic: boolean;
  readonly requires_network: boolean;
  readonly policy_tier: PolicyTier;
  readonly input_schema: Record<string, unknown>;
  readonly output_schema: Record<string, unknown>;
}
