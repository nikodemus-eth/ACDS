import type { InvariantId } from './InvariantId.js';
import type { Severity } from './Severity.js';

/**
 * A single integrity defect discovered by a GRITS checker.
 */
export interface DefectReport {
  /** Unique identifier for this defect. */
  id: string;

  /** The invariant that was violated. */
  invariantId: InvariantId;

  /** Severity of the violation. */
  severity: Severity;

  /** Short title describing the defect. */
  title: string;

  /** Detailed description of what was found. */
  description: string;

  /** Structured evidence supporting the defect. */
  evidence: Record<string, unknown>;

  /** The type of resource involved (e.g. 'execution', 'provider', 'approval'). */
  resourceType: string;

  /** The identifier of the specific resource involved. */
  resourceId: string;

  /** ISO-8601 timestamp of when the defect was detected. */
  detectedAt: string;
}
