/**
 * PlateauSignal - Represents the output of plateau detection for an
 * execution family. Indicates whether a performance plateau has been
 * detected and its severity.
 */

export type PlateauSeverity = 'none' | 'mild' | 'moderate' | 'severe';

export interface PlateauIndicators {
  /** Quality score variance is below acceptable threshold. */
  flatQuality: boolean;

  /** Cost trend is rising over the observation window. */
  risingCost: boolean;

  /** Human correction burden is increasing. */
  risingCorrectionBurden: boolean;

  /** Fallback rate exceeds acceptable threshold. */
  repeatedFallbacks: boolean;

  /** Score persistently below minimum acceptable level. */
  persistentUnderperformance: boolean;
}

export interface PlateauSignal {
  /** The execution family this signal applies to. */
  familyKey: string;

  /** Whether a plateau has been detected. */
  detected: boolean;

  /** Severity classification of the plateau. */
  severity: PlateauSeverity;

  /** Detailed indicators that contributed to the detection. */
  indicators: PlateauIndicators;

  /** ISO-8601 timestamp of when the plateau was detected (or evaluated). */
  detectedAt: string;
}
