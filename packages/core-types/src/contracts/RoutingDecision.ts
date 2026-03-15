export interface FallbackEntry {
  modelProfileId: string;
  tacticProfileId: string;
  providerId: string;
  priority: number;
}

export interface RoutingDecision {
  id: string;
  selectedModelProfileId: string;
  selectedTacticProfileId: string;
  selectedProviderId: string;
  fallbackChain: FallbackEntry[];
  rationaleId: string;
  rationaleSummary: string;
  resolvedAt: Date;
}
