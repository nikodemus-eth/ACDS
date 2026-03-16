import type { InvariantId } from '../types/InvariantId.js';
import type { Cadence } from '../types/Cadence.js';
import type { CheckerResult } from '../types/CheckerResult.js';

/**
 * Contract for all GRITS integrity checker modules.
 *
 * Each checker evaluates one or more invariants and returns
 * a structured result. Checkers receive repositories via
 * constructor injection and must never modify system state.
 */
export interface IntegrityChecker {
  /** Human-readable name for this checker. */
  readonly name: string;

  /** The invariant IDs this checker evaluates. */
  readonly invariantIds: InvariantId[];

  /** Which cadences this checker supports. */
  readonly supportedCadences: Cadence[];

  /**
   * Run the integrity check for the given cadence.
   * Cadence may influence sample size or time window.
   */
  check(cadence: Cadence): Promise<CheckerResult>;
}
