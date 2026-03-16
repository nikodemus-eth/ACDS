import type { GlobalPolicy } from '../global/GlobalPolicy.js';
import type { ApplicationPolicy } from '../application/ApplicationPolicy.js';
import type { ProcessPolicy } from '../process/ProcessPolicy.js';

export class PolicyValidator {
  validateGlobal(policy: GlobalPolicy): string[] {
    const errors: string[] = [];
    if (!policy.allowedVendors || policy.allowedVendors.length === 0) {
      errors.push('Global policy must have at least one allowed vendor');
    }
    if (!policy.defaultPrivacy) errors.push('Default privacy is required');
    if (!policy.defaultCostSensitivity) errors.push('Default cost sensitivity is required');
    return errors;
  }

  validateApplication(policy: ApplicationPolicy): string[] {
    const errors: string[] = [];
    if (!policy.application) errors.push('Application name is required');
    return errors;
  }

  validateProcess(policy: ProcessPolicy): string[] {
    const errors: string[] = [];
    if (!policy.application) errors.push('Application name is required');
    if (!policy.process) errors.push('Process name is required');
    return errors;
  }
}
