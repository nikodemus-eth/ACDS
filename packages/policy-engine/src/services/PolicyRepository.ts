import type { GlobalPolicy } from '../global/GlobalPolicy.js';
import type { ApplicationPolicy } from '../application/ApplicationPolicy.js';
import type { ProcessPolicy } from '../process/ProcessPolicy.js';

/**
 * Persistence interface for all three policy layers.
 *
 * Implementations back this against PostgreSQL, an in-memory store for tests,
 * or any other storage mechanism.
 */
export interface PolicyRepository {
  // ---------------------------------------------------------------------------
  // Global
  // ---------------------------------------------------------------------------

  getGlobalPolicy(): Promise<GlobalPolicy | null>;
  saveGlobalPolicy(policy: GlobalPolicy): Promise<GlobalPolicy>;

  // ---------------------------------------------------------------------------
  // Application
  // ---------------------------------------------------------------------------

  getApplicationPolicy(application: string): Promise<ApplicationPolicy | null>;
  listApplicationPolicies(): Promise<ApplicationPolicy[]>;
  saveApplicationPolicy(policy: ApplicationPolicy): Promise<ApplicationPolicy>;
  deleteApplicationPolicy(application: string): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Process
  // ---------------------------------------------------------------------------

  getProcessPolicy(
    application: string,
    process: string,
    step: string | null,
  ): Promise<ProcessPolicy | null>;
  listProcessPolicies(application: string): Promise<ProcessPolicy[]>;
  saveProcessPolicy(policy: ProcessPolicy): Promise<ProcessPolicy>;
  deleteProcessPolicy(id: string): Promise<boolean>;
}
