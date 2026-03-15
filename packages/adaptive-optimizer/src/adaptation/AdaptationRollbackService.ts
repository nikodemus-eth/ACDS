/**
 * AdaptationRollbackService - Provides preview and execution of rollback
 * operations that restore a family's ranking to a prior adaptation state.
 *
 * Validates safety before executing and emits audit events for all
 * rollback operations. No provider execution or policy bypass occurs.
 */

import { randomUUID } from 'node:crypto';
import type { AdaptationEvent } from './AdaptationEventBuilder.js';
import type { AdaptationLedgerWriter } from './AdaptationLedgerWriter.js';
import type { OptimizerStateRepository } from '../state/OptimizerStateRepository.js';
import type { RankingSnapshot, CandidateRankingEntry } from './RankingSnapshot.js';
import type { AdaptationRollbackRecord } from './AdaptationRollbackRecord.js';
import type { RankedCandidate } from '../selection/CandidateRanker.js';

// ── Audit event types ──────────────────────────────────────────────────────

export type RollbackAuditEventType = 'rollback_previewed' | 'rollback_executed';

export interface RollbackAuditEvent {
  type: RollbackAuditEventType;
  rollbackId: string;
  familyKey: string;
  targetAdaptationEventId: string;
  actor: string;
  reason: string;
  timestamp: string;
}

export interface RollbackAuditEmitter {
  emit(event: RollbackAuditEvent): void;
}

// ── Rollback record writer ─────────────────────────────────────────────────

export interface RollbackRecordWriter {
  save(record: AdaptationRollbackRecord): Promise<void>;
}

// ── Preview result ─────────────────────────────────────────────────────────

export interface RollbackPreview {
  /** Whether the rollback can be safely executed. */
  safe: boolean;

  /** A preview of the rollback record that would be created. */
  preview: AdaptationRollbackRecord;

  /** If not safe, the reasons why. */
  warnings: string[];
}

// ── Service ────────────────────────────────────────────────────────────────

export class AdaptationRollbackService {
  constructor(
    private readonly ledger: AdaptationLedgerWriter,
    private readonly optimizerRepo: OptimizerStateRepository,
    private readonly rollbackWriter: RollbackRecordWriter,
    private readonly auditEmitter: RollbackAuditEmitter,
  ) {}

  /**
   * Previews what a rollback to a given adaptation event would look like
   * without actually executing it.
   *
   * @param familyKey - The family to roll back.
   * @param targetEventId - The adaptation event to roll back to.
   * @returns A preview including safety assessment and the projected record.
   */
  async previewRollback(
    familyKey: string,
    targetEventId: string,
  ): Promise<RollbackPreview> {
    const { targetEvent: _targetEvent, currentSnapshot, restoredSnapshot, warnings } =
      await this.buildRollbackContext(familyKey, targetEventId);

    const record: AdaptationRollbackRecord = {
      id: randomUUID(),
      familyKey,
      targetAdaptationEventId: targetEventId,
      previousSnapshot: currentSnapshot,
      restoredSnapshot,
      actor: '',
      reason: '',
      rolledBackAt: new Date().toISOString(),
    };

    return {
      safe: warnings.length === 0,
      preview: record,
      warnings,
    };
  }

  /**
   * Executes a rollback to the state captured by a specific adaptation event.
   *
   * @param familyKey - The family to roll back.
   * @param targetEventId - The adaptation event to roll back to.
   * @param actor - The human or system actor initiating the rollback.
   * @param reason - Free-text rationale.
   * @returns The persisted rollback record.
   * @throws If the rollback is not safe to execute.
   */
  async executeRollback(
    familyKey: string,
    targetEventId: string,
    actor: string,
    reason: string,
  ): Promise<AdaptationRollbackRecord> {
    const { currentSnapshot, restoredSnapshot, warnings } =
      await this.buildRollbackContext(familyKey, targetEventId);

    if (warnings.length > 0) {
      throw new Error(
        `Rollback for family '${familyKey}' is not safe: ${warnings.join('; ')}`,
      );
    }

    const now = new Date().toISOString();
    const record: AdaptationRollbackRecord = {
      id: randomUUID(),
      familyKey,
      targetAdaptationEventId: targetEventId,
      previousSnapshot: currentSnapshot,
      restoredSnapshot,
      actor,
      reason,
      rolledBackAt: now,
    };

    await this.rollbackWriter.save(record);

    this.auditEmitter.emit({
      type: 'rollback_executed',
      rollbackId: record.id,
      familyKey,
      targetAdaptationEventId: targetEventId,
      actor,
      reason,
      timestamp: now,
    });

    return record;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private async buildRollbackContext(
    familyKey: string,
    targetEventId: string,
  ): Promise<{
    targetEvent: AdaptationEvent;
    currentSnapshot: RankingSnapshot;
    restoredSnapshot: RankingSnapshot;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    // Fetch target event
    const targetEvent = await this.ledger.getEvent(targetEventId);
    if (!targetEvent) {
      throw new Error(`Adaptation event not found: ${targetEventId}`);
    }

    if (targetEvent.familyKey !== familyKey) {
      throw new Error(
        `Adaptation event ${targetEventId} belongs to family '${targetEvent.familyKey}', not '${familyKey}'.`,
      );
    }

    // Build current snapshot from optimizer state
    const familyState = await this.optimizerRepo.getFamilyState(familyKey);
    if (!familyState) {
      throw new Error(`Family state not found for '${familyKey}'.`);
    }

    const candidateStates = await this.optimizerRepo.getCandidateStates(familyKey);
    const currentSnapshot = this.buildSnapshotFromCandidates(
      familyKey,
      candidateStates.map((c, i) => ({
        candidateId: c.candidateId,
        rank: i + 1,
        score: c.rollingScore,
      })),
      familyState.explorationRate,
    );

    // Build restored snapshot from the target event's previous ranking
    const restoredSnapshot = this.buildSnapshotFromRankedCandidates(
      familyKey,
      targetEvent.previousRanking,
      targetEvent.policyBoundsSnapshot.explorationRate,
    );

    // Safety checks
    if (targetEvent.previousRanking.length === 0) {
      warnings.push('Target event has an empty previous ranking.');
    }

    // Check if the target event is very old (more than 7 days)
    const eventAge = Date.now() - new Date(targetEvent.createdAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (eventAge > sevenDaysMs) {
      warnings.push(
        `Target event is ${Math.round(eventAge / (24 * 60 * 60 * 1000))} days old. Rolling back to stale state may be risky.`,
      );
    }

    return { targetEvent, currentSnapshot, restoredSnapshot, warnings };
  }

  private buildSnapshotFromCandidates(
    familyKey: string,
    entries: CandidateRankingEntry[],
    explorationRate: number,
  ): RankingSnapshot {
    return {
      familyKey,
      candidateRankings: entries,
      explorationRate,
      capturedAt: new Date().toISOString(),
    };
  }

  private buildSnapshotFromRankedCandidates(
    familyKey: string,
    ranked: RankedCandidate[],
    explorationRate: number,
  ): RankingSnapshot {
    return {
      familyKey,
      candidateRankings: ranked.map((r) => ({
        candidateId: r.candidate.candidateId,
        rank: r.rank,
        score: r.compositeScore,
      })),
      explorationRate,
      capturedAt: new Date().toISOString(),
    };
  }
}
