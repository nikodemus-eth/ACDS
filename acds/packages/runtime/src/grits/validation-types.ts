/**
 * GRITS validation result types.
 */

export interface GritsValidationResult {
  readonly test_id: string;
  readonly passed: boolean;
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly category: string;
  readonly details: string;
  readonly timestamp: string;
}

export type GritsSignal = "pass" | "fail" | "warning" | "drift";
