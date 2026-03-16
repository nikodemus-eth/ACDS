/**
 * OperationalIntegrityChecker — Verifies INV-008.
 *
 * INV-008: Client metadata cannot spoof posture or escalation.
 *
 * Validates:
 * - DecisionPosture and CognitiveGrade enum values are within valid ranges
 * - Latency anomalies (negative or excessively high values)
 * - Stale executions (pending/running beyond threshold)
 * - Completed executions have completedAt timestamps
 * - Execution gap detection (no executions for extended periods)
 */

import type {
  IntegrityChecker,
  Cadence,
  CheckerResult,
  InvariantCheckResult,
  DefectReport,
  InvariantId,
} from '@acds/grits';
import type { ExecutionRecordReadRepository } from '@acds/grits';
import { DecisionPosture, CognitiveGrade } from '@acds/core-types';

let defectCounter = 0;
function nextDefectId(): string {
  return `GRITS-OPS-${++defectCounter}`;
}

const VALID_POSTURES = new Set(Object.values(DecisionPosture));
const VALID_GRADES = new Set(Object.values(CognitiveGrade));

/** Latency above this (in ms) is flagged as anomalous */
const MAX_REASONABLE_LATENCY_MS = 300_000; // 5 minutes
/** Executions pending/running longer than this (ms) are stale */
const STALE_EXECUTION_THRESHOLD_MS = 3_600_000; // 1 hour
/** Gap between consecutive executions longer than this (ms) is flagged */
const EXECUTION_GAP_THRESHOLD_MS = 4 * 3_600_000; // 4 hours

export class OperationalIntegrityChecker implements IntegrityChecker {
  readonly name = 'OperationalIntegrityChecker';
  readonly invariantIds: InvariantId[] = ['INV-008'];
  readonly supportedCadences: Cadence[] = ['daily', 'release'];

  constructor(
    private readonly executionRepo: ExecutionRecordReadRepository,
  ) {}

  async check(cadence: Cadence): Promise<CheckerResult> {
    const result = await this.checkINV008(cadence);

    return {
      checkerName: this.name,
      cadence,
      invariants: [result],
    };
  }

  private async checkINV008(cadence: Cadence): Promise<InvariantCheckResult> {
    const start = Date.now();
    const defects: DefectReport[] = [];
    const hoursBack = cadence === 'daily' ? 24 : 168;
    const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
    const until = new Date().toISOString();

    const executions = await this.executionRepo.findByTimeRange(since, until);
    const now = Date.now();

    for (const exec of executions) {
      // 1. Validate DecisionPosture enum
      const posture = exec.executionFamily.decisionPosture;
      if (posture && !VALID_POSTURES.has(posture as DecisionPosture)) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-008',
          severity: 'high',
          title: 'Invalid decision posture in execution family',
          description: `Execution ${exec.id} has decision posture "${posture}" which is not a valid DecisionPosture enum value.`,
          evidence: {
            executionId: exec.id,
            posture,
            validPostures: Array.from(VALID_POSTURES),
          },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }

      // 2. Validate CognitiveGrade enum
      const grade = exec.executionFamily.cognitiveGrade;
      if (grade && !VALID_GRADES.has(grade as CognitiveGrade)) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-008',
          severity: 'high',
          title: 'Invalid cognitive grade in execution family',
          description: `Execution ${exec.id} has cognitive grade "${grade}" which is not a valid CognitiveGrade enum value.`,
          evidence: {
            executionId: exec.id,
            grade,
            validGrades: Array.from(VALID_GRADES),
          },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }

      // 3. Latency anomaly detection
      if (exec.latencyMs !== null) {
        if (exec.latencyMs < 0) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-008',
            severity: 'high',
            title: 'Negative latency detected',
            description: `Execution ${exec.id} reports latency of ${exec.latencyMs}ms — negative latency indicates clock skew or data corruption.`,
            evidence: {
              executionId: exec.id,
              latencyMs: exec.latencyMs,
            },
            resourceType: 'execution',
            resourceId: exec.id,
            detectedAt: new Date().toISOString(),
          });
        } else if (exec.latencyMs > MAX_REASONABLE_LATENCY_MS) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-008',
            severity: 'medium',
            title: 'Anomalously high latency',
            description: `Execution ${exec.id} reports latency of ${exec.latencyMs}ms (>${MAX_REASONABLE_LATENCY_MS}ms threshold).`,
            evidence: {
              executionId: exec.id,
              latencyMs: exec.latencyMs,
              thresholdMs: MAX_REASONABLE_LATENCY_MS,
            },
            resourceType: 'execution',
            resourceId: exec.id,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      // 4. Completed execution missing completedAt
      const isTerminal = exec.status === 'succeeded' || exec.status === 'failed'
        || exec.status === 'fallback_succeeded' || exec.status === 'fallback_failed';
      if (isTerminal && exec.completedAt === null) {
        defects.push({
          id: nextDefectId(),
          invariantId: 'INV-008',
          severity: 'high',
          title: 'Completed execution missing completedAt timestamp',
          description: `Execution ${exec.id} has terminal status "${exec.status}" but no completedAt timestamp.`,
          evidence: {
            executionId: exec.id,
            status: exec.status,
          },
          resourceType: 'execution',
          resourceId: exec.id,
          detectedAt: new Date().toISOString(),
        });
      }

      // 5. Stale execution detection
      const isInFlight = exec.status === 'pending' || exec.status === 'running';
      if (isInFlight) {
        const age = now - new Date(exec.createdAt).getTime();
        if (age > STALE_EXECUTION_THRESHOLD_MS) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-008',
            severity: 'medium',
            title: 'Stale execution detected',
            description: `Execution ${exec.id} has been in "${exec.status}" state for ${Math.round(age / 60_000)} minutes (>${STALE_EXECUTION_THRESHOLD_MS / 60_000}min threshold).`,
            evidence: {
              executionId: exec.id,
              status: exec.status,
              ageMs: age,
              thresholdMs: STALE_EXECUTION_THRESHOLD_MS,
            },
            resourceType: 'execution',
            resourceId: exec.id,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    // 6. Execution gap detection — sort by createdAt and look for large gaps
    if (executions.length >= 2) {
      const sorted = [...executions].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      for (let i = 1; i < sorted.length; i++) {
        const gap = new Date(sorted[i].createdAt).getTime() - new Date(sorted[i - 1].createdAt).getTime();
        if (gap > EXECUTION_GAP_THRESHOLD_MS) {
          defects.push({
            id: nextDefectId(),
            invariantId: 'INV-008',
            severity: 'low',
            title: 'Execution gap detected',
            description: `${Math.round(gap / 3_600_000)}h gap between executions ${sorted[i - 1].id} and ${sorted[i].id} (>${EXECUTION_GAP_THRESHOLD_MS / 3_600_000}h threshold).`,
            evidence: {
              previousExecutionId: sorted[i - 1].id,
              nextExecutionId: sorted[i].id,
              gapMs: gap,
              thresholdMs: EXECUTION_GAP_THRESHOLD_MS,
            },
            resourceType: 'execution',
            resourceId: sorted[i].id,
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }

    return {
      invariantId: 'INV-008',
      status: defects.length > 0 ? 'fail' : 'pass',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      sampleSize: executions.length,
      defects,
      summary: defects.length > 0
        ? `${defects.length} operational anomaly/anomalies detected across ${executions.length} execution(s)`
        : `All ${executions.length} execution(s) have valid client metadata and operational health`,
    };
  }
}
