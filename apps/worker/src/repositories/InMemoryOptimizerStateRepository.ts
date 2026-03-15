/**
 * InMemoryOptimizerStateRepository - Working in-memory implementation
 * of the OptimizerStateRepository interface.
 *
 * Provides a singleton shared across all worker handlers so that
 * plateau detection, adaptation recommendations, and auto-apply
 * can all see the same optimizer state within a single process.
 */

import type { OptimizerStateRepository, FamilySelectionState, CandidatePerformanceState } from '@acds/adaptive-optimizer';

export class InMemoryOptimizerStateRepository implements OptimizerStateRepository {
  private readonly familyStates = new Map<string, FamilySelectionState>();
  private readonly candidateStates = new Map<string, CandidatePerformanceState[]>();

  async getFamilyState(familyKey: string): Promise<FamilySelectionState | undefined> {
    return this.familyStates.get(familyKey);
  }

  async saveFamilyState(state: FamilySelectionState): Promise<void> {
    this.familyStates.set(state.familyKey, state);
  }

  async getCandidateStates(familyKey: string): Promise<CandidatePerformanceState[]> {
    return this.candidateStates.get(familyKey) ?? [];
  }

  async saveCandidateState(state: CandidatePerformanceState): Promise<void> {
    const existing = this.candidateStates.get(state.familyKey) ?? [];
    const idx = existing.findIndex((c) => c.candidateId === state.candidateId);
    if (idx >= 0) {
      existing[idx] = state;
    } else {
      existing.push(state);
    }
    this.candidateStates.set(state.familyKey, existing);
  }

  async listFamilies(): Promise<string[]> {
    return [...this.familyStates.keys()];
  }
}

const sharedOptimizerRepo = new InMemoryOptimizerStateRepository();

export function getSharedOptimizerStateRepository(): InMemoryOptimizerStateRepository {
  return sharedOptimizerRepo;
}
