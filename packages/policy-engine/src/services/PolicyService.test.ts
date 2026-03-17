import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyService } from './PolicyService.js';
import type { PolicyRepository } from './PolicyRepository.js';
import type { GlobalPolicy } from '../global/GlobalPolicy.js';
import type { ApplicationPolicy } from '../application/ApplicationPolicy.js';
import type { ProcessPolicy } from '../process/ProcessPolicy.js';

/** In-memory PolicyRepository for testing (no mocks). */
class InMemoryPolicyRepository implements PolicyRepository {
  private globalPolicy: GlobalPolicy | null = null;
  private appPolicies = new Map<string, ApplicationPolicy>();
  private processPolicies = new Map<string, ProcessPolicy>();

  async getGlobalPolicy(): Promise<GlobalPolicy | null> {
    return this.globalPolicy;
  }

  async saveGlobalPolicy(policy: GlobalPolicy): Promise<GlobalPolicy> {
    this.globalPolicy = policy;
    return policy;
  }

  async getApplicationPolicy(application: string): Promise<ApplicationPolicy | null> {
    return this.appPolicies.get(application) ?? null;
  }

  async listApplicationPolicies(): Promise<ApplicationPolicy[]> {
    return [...this.appPolicies.values()];
  }

  async saveApplicationPolicy(policy: ApplicationPolicy): Promise<ApplicationPolicy> {
    this.appPolicies.set(policy.application, policy);
    return policy;
  }

  async deleteApplicationPolicy(application: string): Promise<boolean> {
    return this.appPolicies.delete(application);
  }

  async getProcessPolicy(application: string, process: string, step: string | null): Promise<ProcessPolicy | null> {
    for (const p of this.processPolicies.values()) {
      if (p.application === application && p.process === process && p.step === step) return p;
    }
    return null;
  }

  async listProcessPolicies(application: string): Promise<ProcessPolicy[]> {
    return [...this.processPolicies.values()].filter((p) => p.application === application);
  }

  async saveProcessPolicy(policy: ProcessPolicy): Promise<ProcessPolicy> {
    this.processPolicies.set(policy.id, policy);
    return policy;
  }

  async deleteProcessPolicy(id: string): Promise<boolean> {
    return this.processPolicies.delete(id);
  }
}

function makeGlobalPolicy(overrides: Partial<GlobalPolicy> = {}): GlobalPolicy {
  return {
    id: 'global-1',
    allowedVendors: [],
    blockedVendors: [],
    defaultPrivacy: 'cloud_allowed',
    defaultCostSensitivity: 'medium',
    structuredOutputRequiredForGrades: [],
    traceabilityRequiredForGrades: [],
    maxLatencyMsByLoadTier: {},
    localPreferredTaskTypes: [],
    cloudRequiredLoadTiers: [],
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAppPolicy(overrides: Partial<ApplicationPolicy> = {}): ApplicationPolicy {
  return {
    id: 'app-1',
    application: 'test-app',
    allowedVendors: null,
    blockedVendors: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    preferredModelProfileIds: null,
    blockedModelProfileIds: null,
    localPreferredTaskTypes: null,
    structuredOutputRequiredForGrades: null,
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProcessPolicy(overrides: Partial<ProcessPolicy> = {}): ProcessPolicy {
  return {
    id: 'proc-1',
    application: 'test-app',
    process: 'test-process',
    step: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    allowedModelProfileIds: null,
    blockedModelProfileIds: null,
    allowedTacticProfileIds: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    forceEscalationForGrades: null,
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PolicyService', () => {
  let repo: InMemoryPolicyRepository;
  let service: PolicyService;

  beforeEach(() => {
    repo = new InMemoryPolicyRepository();
    service = new PolicyService(repo);
  });

  // --- Global Policy ---

  describe('getGlobalPolicy', () => {
    it('returns null when no global policy exists', async () => {
      expect(await service.getGlobalPolicy()).toBeNull();
    });

    it('returns the saved global policy', async () => {
      const gp = makeGlobalPolicy();
      await service.saveGlobalPolicy(gp);
      const result = await service.getGlobalPolicy();
      expect(result).not.toBeNull();
      expect(result!.id).toBe('global-1');
    });
  });

  describe('saveGlobalPolicy', () => {
    it('saves and returns the policy with updated timestamp', async () => {
      const before = new Date();
      const gp = makeGlobalPolicy();
      const saved = await service.saveGlobalPolicy(gp);
      expect(saved.id).toBe('global-1');
      expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('throws when id is empty', async () => {
      const gp = makeGlobalPolicy({ id: '' });
      await expect(service.saveGlobalPolicy(gp)).rejects.toThrow('global policy id must not be empty');
    });

    it('throws when id is whitespace only', async () => {
      const gp = makeGlobalPolicy({ id: '   ' });
      await expect(service.saveGlobalPolicy(gp)).rejects.toThrow('global policy id must not be empty');
    });
  });

  // --- Application Policy ---

  describe('getApplicationPolicy', () => {
    it('returns null when not found', async () => {
      expect(await service.getApplicationPolicy('nonexistent')).toBeNull();
    });

    it('throws when application is empty', async () => {
      await expect(service.getApplicationPolicy('')).rejects.toThrow('application must not be empty');
    });

    it('returns the stored policy', async () => {
      await service.saveApplicationPolicy(makeAppPolicy());
      const result = await service.getApplicationPolicy('test-app');
      expect(result).not.toBeNull();
      expect(result!.application).toBe('test-app');
    });
  });

  describe('listApplicationPolicies', () => {
    it('returns empty array when none exist', async () => {
      expect(await service.listApplicationPolicies()).toEqual([]);
    });

    it('returns all saved application policies', async () => {
      await service.saveApplicationPolicy(makeAppPolicy({ id: 'a1', application: 'app-a' }));
      await service.saveApplicationPolicy(makeAppPolicy({ id: 'a2', application: 'app-b' }));
      const list = await service.listApplicationPolicies();
      expect(list).toHaveLength(2);
    });
  });

  describe('saveApplicationPolicy', () => {
    it('saves and returns with updated timestamp', async () => {
      const before = new Date();
      const saved = await service.saveApplicationPolicy(makeAppPolicy());
      expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('throws when id is empty', async () => {
      await expect(service.saveApplicationPolicy(makeAppPolicy({ id: '' }))).rejects.toThrow('application policy id must not be empty');
    });

    it('throws when application is empty', async () => {
      await expect(service.saveApplicationPolicy(makeAppPolicy({ application: '' }))).rejects.toThrow('application must not be empty');
    });
  });

  describe('deleteApplicationPolicy', () => {
    it('returns false when policy does not exist', async () => {
      expect(await service.deleteApplicationPolicy('nonexistent')).toBe(false);
    });

    it('deletes and returns true', async () => {
      await service.saveApplicationPolicy(makeAppPolicy());
      expect(await service.deleteApplicationPolicy('test-app')).toBe(true);
      expect(await service.getApplicationPolicy('test-app')).toBeNull();
    });

    it('throws when application is empty', async () => {
      await expect(service.deleteApplicationPolicy('')).rejects.toThrow('application must not be empty');
    });
  });

  // --- Process Policy ---

  describe('getProcessPolicy', () => {
    it('returns null when not found', async () => {
      expect(await service.getProcessPolicy('app', 'proc', null)).toBeNull();
    });

    it('throws when application is empty', async () => {
      await expect(service.getProcessPolicy('', 'proc', null)).rejects.toThrow('application must not be empty');
    });

    it('throws when process is empty', async () => {
      await expect(service.getProcessPolicy('app', '', null)).rejects.toThrow('process must not be empty');
    });

    it('returns stored process policy', async () => {
      await service.saveProcessPolicy(makeProcessPolicy());
      const result = await service.getProcessPolicy('test-app', 'test-process', null);
      expect(result).not.toBeNull();
      expect(result!.process).toBe('test-process');
    });
  });

  describe('listProcessPolicies', () => {
    it('returns empty array when none exist', async () => {
      expect(await service.listProcessPolicies('app')).toEqual([]);
    });

    it('throws when application is empty', async () => {
      await expect(service.listProcessPolicies('')).rejects.toThrow('application must not be empty');
    });

    it('returns policies for the given application', async () => {
      await service.saveProcessPolicy(makeProcessPolicy({ id: 'p1', application: 'app-a', process: 'proc-1' }));
      await service.saveProcessPolicy(makeProcessPolicy({ id: 'p2', application: 'app-a', process: 'proc-2' }));
      await service.saveProcessPolicy(makeProcessPolicy({ id: 'p3', application: 'app-b', process: 'proc-3' }));
      const list = await service.listProcessPolicies('app-a');
      expect(list).toHaveLength(2);
    });
  });

  describe('saveProcessPolicy', () => {
    it('saves and returns with updated timestamp', async () => {
      const before = new Date();
      const saved = await service.saveProcessPolicy(makeProcessPolicy());
      expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('throws when id is empty', async () => {
      await expect(service.saveProcessPolicy(makeProcessPolicy({ id: '' }))).rejects.toThrow('process policy id must not be empty');
    });

    it('throws when application is empty', async () => {
      await expect(service.saveProcessPolicy(makeProcessPolicy({ application: '' }))).rejects.toThrow('application must not be empty');
    });

    it('throws when process is empty', async () => {
      await expect(service.saveProcessPolicy(makeProcessPolicy({ process: '' }))).rejects.toThrow('process must not be empty');
    });
  });

  describe('deleteProcessPolicy', () => {
    it('returns false when policy does not exist', async () => {
      expect(await service.deleteProcessPolicy('nonexistent')).toBe(false);
    });

    it('deletes and returns true', async () => {
      await service.saveProcessPolicy(makeProcessPolicy());
      expect(await service.deleteProcessPolicy('proc-1')).toBe(true);
    });

    it('throws when id is empty', async () => {
      await expect(service.deleteProcessPolicy('')).rejects.toThrow('process policy id must not be empty');
    });
  });
});
