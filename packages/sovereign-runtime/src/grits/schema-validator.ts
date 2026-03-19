import type { z } from 'zod';
import type { ValidationResult } from './validation-types.js';

/**
 * Validates method output against the registered output schema.
 */
export function validateOutputSchema(
  output: unknown,
  schema: z.ZodType,
): ValidationResult {
  const result = schema.safeParse(output);

  if (result.success) {
    return {
      status: 'pass',
      severity: 'low',
      message: 'Output schema validation passed',
    };
  }

  return {
    status: 'fail',
    severity: 'high',
    message: `Output schema validation failed: ${result.error.message}`,
    details: { errors: result.error.errors },
  };
}
