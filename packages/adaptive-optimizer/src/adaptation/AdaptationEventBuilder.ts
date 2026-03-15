/**
 * AdaptationEventBuilder - Constructs immutable adaptation event records
 * that capture the before/after state of an optimizer adaptation.
 */

import type { RankedCandidate } from '../selection/CandidateRanker.js';
import type { AdaptiveMode } from '../selection/AdaptiveSelectionService.js';

export type AdaptationTrigger = 'scheduled' | 'plateau' | 'manual';

export interface PolicyBoundsSnapshot {
  /** The exploration rate at the time of the adaptation. */
  explorationRate: number;
  /** The adaptive mode in effect. */
  mode: AdaptiveMode;
  /** Any additional policy constraints in effect. */
  additionalConstraints: Record<string, unknown>;
}

export interface AdaptationEvent {
  /** Unique identifier for this adaptation event. */
  id: string;

  /** The execution family this adaptation applies to. */
  familyKey: string;

  /** Candidate ranking before the adaptation. */
  previousRanking: RankedCandidate[];

  /** Candidate ranking after the adaptation. */
  newRanking: RankedCandidate[];

  /** What triggered this adaptation. */
  trigger: AdaptationTrigger;

  /** Human-readable summary of the evidence supporting this adaptation. */
  evidenceSummary: string;

  /** The adaptive mode in effect at the time of the adaptation. */
  mode: AdaptiveMode;

  /** Snapshot of policy bounds at the time of adaptation. */
  policyBoundsSnapshot: PolicyBoundsSnapshot;

  /** ISO-8601 timestamp of when this event was created. */
  createdAt: string;
}

export interface BuildAdaptationEventParams {
  id: string;
  familyKey: string;
  previousRanking: RankedCandidate[];
  newRanking: RankedCandidate[];
  trigger: AdaptationTrigger;
  evidenceSummary: string;
  mode: AdaptiveMode;
  policyBoundsSnapshot: PolicyBoundsSnapshot;
}

/**
 * Builds an immutable AdaptationEvent with a creation timestamp.
 *
 * @param params - All fields required to construct the event.
 * @returns A fully-formed AdaptationEvent.
 */
export function buildAdaptationEvent(params: BuildAdaptationEventParams): AdaptationEvent {
  return {
    id: params.id,
    familyKey: params.familyKey,
    previousRanking: params.previousRanking,
    newRanking: params.newRanking,
    trigger: params.trigger,
    evidenceSummary: params.evidenceSummary,
    mode: params.mode,
    policyBoundsSnapshot: params.policyBoundsSnapshot,
    createdAt: new Date().toISOString(),
  };
}
