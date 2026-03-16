/**
 * OptimizerStateRepository - Abstract persistence interface for optimizer state.
 *
 * Implementations may back this with a database, in-memory store, or file system.
 * All methods return Promises to support async persistence backends.
 */

import type { FamilySelectionState } from './FamilySelectionState.js';
import type { CandidatePerformanceState } from './CandidatePerformanceState.js';

export interface OptimizerStateRepository {
  /**
   * Retrieves the current selection state for an execution family.
   * Returns undefined if no state exists for the given family.
   */
  getFamilyState(familyKey: string): Promise<FamilySelectionState | undefined>;

  /**
   * Persists (creates or updates) the selection state for an execution family.
   */
  saveFamilyState(state: FamilySelectionState): Promise<void>;

  /**
   * Retrieves all candidate performance states for a given execution family.
   */
  getCandidateStates(familyKey: string): Promise<CandidatePerformanceState[]>;

  /**
   * Persists (creates or updates) the performance state for a single candidate.
   */
  saveCandidateState(state: CandidatePerformanceState): Promise<void>;

  /**
   * Lists all family keys that have stored optimizer state.
   */
  listFamilies(): Promise<string[]>;
}
