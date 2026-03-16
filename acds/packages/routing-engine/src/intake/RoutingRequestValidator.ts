import { routingRequestSchema } from '@acds/core-types';
import type { RoutingRequest } from '@acds/core-types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class RoutingRequestValidator {
  validate(request: unknown): ValidationResult {
    const result = routingRequestSchema.safeParse(request);
    if (result.success) {
      return { valid: true, errors: [] };
    }
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    return { valid: false, errors };
  }

  validateTyped(request: RoutingRequest): ValidationResult {
    return this.validate(request);
  }
}
