// ---------------------------------------------------------------------------
// RoutingDecisionPresenter – formats RoutingDecision for API responses
// ---------------------------------------------------------------------------

import type { RoutingDecision, FallbackEntry } from '@acds/core-types';

/**
 * Public shape returned to API clients.  NEVER exposes secrets.
 */
export interface RoutingDecisionView {
  id: string;
  selectedModelProfileId: string;
  selectedTacticProfileId: string;
  selectedProviderId: string;
  fallbackChain: FallbackEntryView[];
  rationaleSummary: string;
  resolvedAt: string;
}

export interface FallbackEntryView {
  modelProfileId: string;
  tacticProfileId: string;
  providerId: string;
  priority: number;
}

export class RoutingDecisionPresenter {
  /**
   * Formats a single RoutingDecision for the API response.
   * Exposes only safe routing metadata – never secrets or internal IDs
   * that could leak infrastructure details.
   */
  static toView(decision: RoutingDecision): RoutingDecisionView {
    return {
      id: decision.id,
      selectedModelProfileId: decision.selectedModelProfileId,
      selectedTacticProfileId: decision.selectedTacticProfileId,
      selectedProviderId: decision.selectedProviderId,
      fallbackChain: decision.fallbackChain.map(RoutingDecisionPresenter.fallbackToView),
      rationaleSummary: decision.rationaleSummary,
      resolvedAt: decision.resolvedAt.toISOString(),
    };
  }

  /**
   * Formats a list of routing decisions.
   */
  static toViewList(decisions: RoutingDecision[]): RoutingDecisionView[] {
    return decisions.map(RoutingDecisionPresenter.toView);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private static fallbackToView(entry: FallbackEntry): FallbackEntryView {
    return {
      modelProfileId: entry.modelProfileId,
      tacticProfileId: entry.tacticProfileId,
      providerId: entry.providerId,
      priority: entry.priority,
    };
  }
}
