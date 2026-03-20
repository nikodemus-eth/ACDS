import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PolicyService } from './PolicyService.js';
import { PgPolicyRepository } from '@acds/persistence-pg';
import type { GlobalPolicy } from '../global/GlobalPolicy.js';
import type { ApplicationPolicy } from '../application/ApplicationPolicy.js';
import type { ProcessPolicy } from '../process/ProcessPolicy.js';
import {
  createTestPool,
  runMigrations,
  closePool,
  type PoolLike,
} from '../../../../tests/__test-support__/pglitePool.js';

// ---------------------------------------------------------------------------
// Deterministic UUID constants for test data
// ---------------------------------------------------------------------------
const UUID_GLOBAL_1  = '00000000-0000-0000-0000-000000000a01';
const UUID_APP_1     = '00000000-0000-0000-0000-000000000b01';
const UUID_APP_2     = '00000000-0000-0000-0000-000000000b02';
const UUID_APP_3     = '00000000-0000-0000-0000-000000000b03';
const UUID_APP_DEL   = '00000000-0000-0000-0000-000000000b04';
const UUID_PROC_1    = '00000000-0000-0000-0000-000000000c01';
const UUID_PROC_2    = '00000000-0000-0000-0000-000000000c02';
const UUID_PROC_3    = '00000000-0000-0000-0000-000000000c03';
const UUID_PROC_4    = '00000000-0000-0000-0000-000000000c04';
const UUID_NONEXIST  = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

let pool: PoolLike;
let repo: PgPolicyRepository;
let service: PolicyService;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query('TRUNCATE global_policies, application_policies, process_policies CASCADE');
  repo = new PgPolicyRepository(pool as any);
  service = new PolicyService(repo);
});

afterAll(async () => {
  await closePool();
});

function makeGlobalPolicy(overrides: Partial<GlobalPolicy> = {}): GlobalPolicy {
  return {
    id: UUID_GLOBAL_1,
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
    id: UUID_APP_1,
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
    id: UUID_PROC_1,
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
      expect(result!.id).toBe(UUID_GLOBAL_1);
    });
  });

  describe('saveGlobalPolicy', () => {
    it('saves and returns the policy with updated timestamp', async () => {
      const before = new Date();
      const gp = makeGlobalPolicy();
      const saved = await service.saveGlobalPolicy(gp);
      expect(saved.id).toBe(UUID_GLOBAL_1);
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
      await service.saveApplicationPolicy(makeAppPolicy({ id: UUID_APP_2, application: 'app-a' }));
      await service.saveApplicationPolicy(makeAppPolicy({ id: UUID_APP_3, application: 'app-b' }));
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
      expect(await service.deleteApplicationPolicy(UUID_NONEXIST)).toBe(false);
    });

    it('deletes and returns true', async () => {
      // PolicyService.deleteApplicationPolicy passes its argument to repo.deleteApplicationPolicy
      // PgPolicyRepository.deleteApplicationPolicy deletes by id column (WHERE id = $1)
      // So we pass the UUID id to deleteApplicationPolicy for the delete to match
      await service.saveApplicationPolicy(makeAppPolicy({ id: UUID_APP_DEL, application: 'del-app' }));
      expect(await service.deleteApplicationPolicy(UUID_APP_DEL)).toBe(true);
      expect(await service.getApplicationPolicy('del-app')).toBeNull();
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
      await service.saveProcessPolicy(makeProcessPolicy({ id: UUID_PROC_2, application: 'app-a', process: 'proc-1' }));
      await service.saveProcessPolicy(makeProcessPolicy({ id: UUID_PROC_3, application: 'app-a', process: 'proc-2' }));
      await service.saveProcessPolicy(makeProcessPolicy({ id: UUID_PROC_4, application: 'app-b', process: 'proc-3' }));
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
      expect(await service.deleteProcessPolicy(UUID_NONEXIST)).toBe(false);
    });

    it('deletes and returns true', async () => {
      await service.saveProcessPolicy(makeProcessPolicy());
      expect(await service.deleteProcessPolicy(UUID_PROC_1)).toBe(true);
    });

    it('throws when id is empty', async () => {
      await expect(service.deleteProcessPolicy('')).rejects.toThrow('process policy id must not be empty');
    });
  });
});
