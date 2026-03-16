import type { GlobalPolicy } from '../global/GlobalPolicy.js';
import type { ApplicationPolicy } from '../application/ApplicationPolicy.js';
import type { ProcessPolicy } from '../process/ProcessPolicy.js';
import type { PolicyRepository } from './PolicyRepository.js';

/**
 * CRUD service for all three policy layers (global, application, process).
 *
 * Delegates persistence to a {@link PolicyRepository} and applies lightweight
 * validation before writes.
 */
export class PolicyService {
  constructor(private readonly repo: PolicyRepository) {}

  // ---------------------------------------------------------------------------
  // Global Policy
  // ---------------------------------------------------------------------------

  async getGlobalPolicy(): Promise<GlobalPolicy | null> {
    return this.repo.getGlobalPolicy();
  }

  async saveGlobalPolicy(policy: GlobalPolicy): Promise<GlobalPolicy> {
    this.assertNonEmpty(policy.id, 'global policy id');
    return this.repo.saveGlobalPolicy({
      ...policy,
      updatedAt: new Date(),
    });
  }

  // ---------------------------------------------------------------------------
  // Application Policy
  // ---------------------------------------------------------------------------

  async getApplicationPolicy(
    application: string,
  ): Promise<ApplicationPolicy | null> {
    this.assertNonEmpty(application, 'application');
    return this.repo.getApplicationPolicy(application);
  }

  async listApplicationPolicies(): Promise<ApplicationPolicy[]> {
    return this.repo.listApplicationPolicies();
  }

  async saveApplicationPolicy(
    policy: ApplicationPolicy,
  ): Promise<ApplicationPolicy> {
    this.assertNonEmpty(policy.id, 'application policy id');
    this.assertNonEmpty(policy.application, 'application');
    return this.repo.saveApplicationPolicy({
      ...policy,
      updatedAt: new Date(),
    });
  }

  async deleteApplicationPolicy(application: string): Promise<boolean> {
    this.assertNonEmpty(application, 'application');
    return this.repo.deleteApplicationPolicy(application);
  }

  // ---------------------------------------------------------------------------
  // Process Policy
  // ---------------------------------------------------------------------------

  async getProcessPolicy(
    application: string,
    process: string,
    step: string | null,
  ): Promise<ProcessPolicy | null> {
    this.assertNonEmpty(application, 'application');
    this.assertNonEmpty(process, 'process');
    return this.repo.getProcessPolicy(application, process, step);
  }

  async listProcessPolicies(application: string): Promise<ProcessPolicy[]> {
    this.assertNonEmpty(application, 'application');
    return this.repo.listProcessPolicies(application);
  }

  async saveProcessPolicy(policy: ProcessPolicy): Promise<ProcessPolicy> {
    this.assertNonEmpty(policy.id, 'process policy id');
    this.assertNonEmpty(policy.application, 'application');
    this.assertNonEmpty(policy.process, 'process');
    return this.repo.saveProcessPolicy({
      ...policy,
      updatedAt: new Date(),
    });
  }

  async deleteProcessPolicy(id: string): Promise<boolean> {
    this.assertNonEmpty(id, 'process policy id');
    return this.repo.deleteProcessPolicy(id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private assertNonEmpty(value: string, label: string): void {
    if (!value || value.trim().length === 0) {
      throw new Error(`PolicyService: ${label} must not be empty`);
    }
  }
}
