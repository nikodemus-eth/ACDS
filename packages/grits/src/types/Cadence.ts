/**
 * Execution cadences for GRITS integrity checks.
 */
export type Cadence =
  | 'fast'    // Hourly — detect immediate integrity failures
  | 'daily'   // Daily — detect drift and anomalies
  | 'release'; // Release-triggered — verify system trust posture
