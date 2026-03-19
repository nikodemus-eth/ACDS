import { z } from 'zod';
import type { PolicyTier } from './policy-tiers.js';

/**
 * Subsystem categories for method grouping.
 */
export type Subsystem =
  | 'foundation_models'
  | 'writing_tools'
  | 'speech'
  | 'tts'
  | 'vision'
  | 'image_creator'
  | 'translation'
  | 'sound';

/**
 * A single method exposed by a provider.
 *
 * Each method has its own policy tier, determinism flag,
 * network requirement, and input/output schemas.
 * This is the unit of routing — ACDS routes to methods, not providers.
 */
export interface MethodDefinition {
  /** Fully qualified method ID, e.g. "apple.foundation_models.summarize". */
  methodId: string;
  /** ID of the provider that owns this method. */
  providerId: string;
  /** Subsystem this method belongs to. */
  subsystem: Subsystem;
  /** Policy tier governing access to this method. */
  policyTier: PolicyTier;
  /** Whether this method produces deterministic output. */
  deterministic: boolean;
  /** Whether this method requires network access. */
  requiresNetwork: boolean;
  /** Zod schema for validating method input. */
  inputSchema: z.ZodType;
  /** Zod schema for validating method output. */
  outputSchema: z.ZodType;
}
