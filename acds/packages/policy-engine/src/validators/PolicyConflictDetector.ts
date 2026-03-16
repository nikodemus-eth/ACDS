import type { GlobalPolicy } from '../global/GlobalPolicy.js';
import type { ApplicationPolicy } from '../application/ApplicationPolicy.js';

export interface PolicyConflict {
  severity: 'warning' | 'error';
  message: string;
  field: string;
}

export class PolicyConflictDetector {
  detect(global: GlobalPolicy, application: ApplicationPolicy): PolicyConflict[] {
    const conflicts: PolicyConflict[] = [];

    if (application.allowedVendors) {
      const unauthorized = application.allowedVendors.filter(
        (v) => global.blockedVendors.includes(v)
      );
      if (unauthorized.length > 0) {
        conflicts.push({
          severity: 'error',
          message: `Application allows vendors blocked by global policy: ${unauthorized.join(', ')}`,
          field: 'allowedVendors',
        });
      }
    }

    if (application.privacyOverride === 'cloud_preferred' && global.defaultPrivacy === 'local_only') {
      conflicts.push({
        severity: 'warning',
        message: 'Application prefers cloud but global policy defaults to local-only',
        field: 'privacy',
      });
    }

    return conflicts;
  }
}
