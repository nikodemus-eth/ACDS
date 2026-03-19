/**
 * GRITS validation types for the sovereign runtime.
 */

export type GRITSSeverity = 'critical' | 'high' | 'medium' | 'low';
export type GRITSStatus = 'pass' | 'fail' | 'warning' | 'drift';

export interface ValidationResult {
  status: GRITSStatus;
  severity: GRITSSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface GRITSHookEvent {
  hookId: string;
  executionId: string;
  methodId: string;
  providerId: string;
  result: ValidationResult;
  timestamp: string;
}
