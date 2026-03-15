// ---------------------------------------------------------------------------
// ExecutionRecordPresenter – formats ExecutionRecord for API responses
// ---------------------------------------------------------------------------

import type { ExecutionRecord, ExecutionStatus, ExecutionFamily } from '@acds/core-types';

/**
 * Public shape returned to API clients.
 * NEVER exposes provider credentials or internal secret references.
 */
export interface ExecutionRecordView {
  id: string;
  executionFamily: ExecutionFamilyView;
  routingDecisionId: string;
  selectedModelProfileId: string;
  selectedTacticProfileId: string;
  selectedProviderId: string;
  status: ExecutionStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  costEstimate: number | null;
  normalizedOutput: string | null;
  errorMessage: string | null;
  fallbackAttempts: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ExecutionFamilyView {
  application: string;
  process: string;
  step: string;
  decisionPosture: string;
  cognitiveGrade: string;
}

export class ExecutionRecordPresenter {
  /**
   * Formats a single ExecutionRecord for the API response.
   * Strips any internal references and ensures dates are ISO-8601 strings.
   * Never exposes provider credentials.
   */
  static toView(record: ExecutionRecord): ExecutionRecordView {
    return {
      id: record.id,
      executionFamily: ExecutionRecordPresenter.familyToView(record.executionFamily),
      routingDecisionId: record.routingDecisionId,
      selectedModelProfileId: record.selectedModelProfileId,
      selectedTacticProfileId: record.selectedTacticProfileId,
      selectedProviderId: record.selectedProviderId,
      status: record.status,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      latencyMs: record.latencyMs,
      costEstimate: record.costEstimate,
      normalizedOutput: record.normalizedOutput,
      errorMessage: record.errorMessage,
      fallbackAttempts: record.fallbackAttempts,
      createdAt: record.createdAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
    };
  }

  /**
   * Formats a list of ExecutionRecord entities.
   */
  static toViewList(records: ExecutionRecord[]): ExecutionRecordView[] {
    return records.map(ExecutionRecordPresenter.toView);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private static familyToView(family: ExecutionFamily): ExecutionFamilyView {
    return {
      application: family.application,
      process: family.process,
      step: family.step,
      decisionPosture: family.decisionPosture,
      cognitiveGrade: family.cognitiveGrade,
    };
  }
}
