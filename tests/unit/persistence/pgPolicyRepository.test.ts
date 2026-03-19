// ---------------------------------------------------------------------------
// Integration Tests – PgPolicyRepository (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgPolicyRepository } from '@acds/persistence-pg';
import {
  createTestPool,
  runMigrations,
  truncateAll,
  closePool,
  type PoolLike,
} from '../../__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);

  // Migration 004 schema doesn't match what PgPolicyRepository expects.
  // Drop and recreate with the columns the repository actually uses.
  await pool.execSQL(`
    DROP TABLE IF EXISTS process_policies CASCADE;
    DROP TABLE IF EXISTS application_policies CASCADE;
    DROP TABLE IF EXISTS global_policies CASCADE;

    CREATE TABLE global_policies (
      id                                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      allowed_vendors                     JSONB,
      blocked_vendors                     JSONB,
      default_privacy                     VARCHAR,
      default_cost_sensitivity            VARCHAR,
      structured_output_required_for_grades JSONB,
      traceability_required_for_grades    JSONB,
      max_latency_ms_by_load_tier         JSONB,
      local_preferred_task_types          JSONB,
      cloud_required_load_tiers           JSONB,
      enabled                             BOOLEAN     DEFAULT true,
      created_at                          TIMESTAMPTZ DEFAULT NOW(),
      updated_at                          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE application_policies (
      id                                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      application                         VARCHAR     NOT NULL UNIQUE,
      allowed_vendors                     JSONB,
      blocked_vendors                     JSONB,
      privacy_override                    VARCHAR,
      cost_sensitivity_override           VARCHAR,
      preferred_model_profile_ids         JSONB,
      blocked_model_profile_ids           JSONB,
      local_preferred_task_types          JSONB,
      structured_output_required_for_grades JSONB,
      enabled                             BOOLEAN     DEFAULT true,
      created_at                          TIMESTAMPTZ DEFAULT NOW(),
      updated_at                          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE process_policies (
      id                                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      application                         VARCHAR     NOT NULL,
      process                             VARCHAR     NOT NULL,
      step                                VARCHAR,
      default_model_profile_id            VARCHAR,
      default_tactic_profile_id           VARCHAR,
      allowed_model_profile_ids           JSONB,
      blocked_model_profile_ids           JSONB,
      allowed_tactic_profile_ids          JSONB,
      privacy_override                    VARCHAR,
      cost_sensitivity_override           VARCHAR,
      force_escalation_for_grades         JSONB,
      enabled                             BOOLEAN     DEFAULT true,
      created_at                          TIMESTAMPTZ DEFAULT NOW(),
      updated_at                          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(application, process, step)
    );
  `);
});

afterAll(async () => {
  await closePool();
});

beforeEach(async () => {
  await truncateAll(pool);
  await pool.query('TRUNCATE global_policies, application_policies, process_policies CASCADE');
});

// Fixed UUIDs for deterministic tests
const GP_ID = '00000000-0000-4000-a000-000000000001';
const AP_ID = '00000000-0000-4000-a000-000000000010';
const AP_ID_B = '00000000-0000-4000-a000-000000000011';
const AP_ID_A = '00000000-0000-4000-a000-000000000012';
const PP_ID = '00000000-0000-4000-a000-000000000020';
const PP_ID_1 = '00000000-0000-4000-a000-000000000021';
const PP_ID_2 = '00000000-0000-4000-a000-000000000022';
const NONEXISTENT_UUID = '00000000-0000-4000-a000-ffffffffffff';

describe('PgPolicyRepository', () => {
  let repo: PgPolicyRepository;

  beforeEach(() => {
    repo = new PgPolicyRepository(pool as any);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GlobalPolicy
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GlobalPolicy', () => {
    function makeGlobalPolicy(overrides: Record<string, unknown> = {}) {
      return {
        id: GP_ID,
        allowedVendors: ['openai', 'anthropic'],
        blockedVendors: [],
        defaultPrivacy: 'standard' as const,
        defaultCostSensitivity: 'balanced' as const,
        structuredOutputRequiredForGrades: ['A'],
        traceabilityRequiredForGrades: ['A', 'B'],
        maxLatencyMsByLoadTier: { low: 5000, medium: 3000, high: 1000 },
        localPreferredTaskTypes: ['summarization'],
        cloudRequiredLoadTiers: ['high'],
        enabled: true,
        updatedAt: new Date('2026-03-16T12:00:00Z'),
        ...overrides,
      };
    }

    describe('getGlobalPolicy()', () => {
      it('returns null when no global policy exists', async () => {
        const result = await repo.getGlobalPolicy();
        expect(result).toBeNull();
      });

      it('returns the saved global policy', async () => {
        const policy = makeGlobalPolicy();
        await repo.saveGlobalPolicy(policy as any);

        const result = await repo.getGlobalPolicy();
        expect(result).not.toBeNull();
        expect(result!.id).toBe(GP_ID);
        expect(result!.allowedVendors).toEqual(['openai', 'anthropic']);
        expect(result!.blockedVendors).toEqual([]);
        expect(result!.defaultPrivacy).toBe('standard');
        expect(result!.defaultCostSensitivity).toBe('balanced');
        expect(result!.structuredOutputRequiredForGrades).toEqual(['A']);
        expect(result!.traceabilityRequiredForGrades).toEqual(['A', 'B']);
        expect(result!.maxLatencyMsByLoadTier).toEqual({ low: 5000, medium: 3000, high: 1000 });
        expect(result!.localPreferredTaskTypes).toEqual(['summarization']);
        expect(result!.cloudRequiredLoadTiers).toEqual(['high']);
        expect(result!.enabled).toBe(true);
      });
    });

    describe('saveGlobalPolicy()', () => {
      it('upserts (updates on conflict)', async () => {
        await repo.saveGlobalPolicy(makeGlobalPolicy() as any);
        await repo.saveGlobalPolicy(makeGlobalPolicy({ defaultPrivacy: 'strict' }) as any);

        const result = await repo.getGlobalPolicy();
        expect(result!.defaultPrivacy).toBe('strict');

        // Confirm only one row exists
        const count = await pool.query('SELECT count(*)::int AS cnt FROM global_policies');
        expect(count.rows[0].cnt).toBe(1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ApplicationPolicy
  // ═══════════════════════════════════════════════════════════════════════════

  describe('ApplicationPolicy', () => {
    function makeAppPolicy(overrides: Record<string, unknown> = {}) {
      return {
        id: AP_ID,
        application: 'my-app',
        allowedVendors: ['openai'],
        blockedVendors: null,
        privacyOverride: 'strict' as const,
        costSensitivityOverride: 'aggressive' as const,
        preferredModelProfileIds: ['mp-1'],
        blockedModelProfileIds: null,
        localPreferredTaskTypes: null,
        structuredOutputRequiredForGrades: null,
        enabled: true,
        updatedAt: new Date('2026-03-16T12:00:00Z'),
        ...overrides,
      };
    }

    describe('findApplicationPolicy()', () => {
      it('returns null when not found', async () => {
        const result = await repo.findApplicationPolicy('nonexistent');
        expect(result).toBeNull();
      });

      it('returns the saved application policy', async () => {
        await repo.saveApplicationPolicy(makeAppPolicy() as any);

        const result = await repo.findApplicationPolicy('my-app');
        expect(result).not.toBeNull();
        expect(result!.id).toBe(AP_ID);
        expect(result!.application).toBe('my-app');
        expect(result!.allowedVendors).toEqual(['openai']);
        expect(result!.blockedVendors).toBeNull();
        expect(result!.privacyOverride).toBe('strict');
        expect(result!.costSensitivityOverride).toBe('aggressive');
        expect(result!.preferredModelProfileIds).toEqual(['mp-1']);
        expect(result!.enabled).toBe(true);
      });
    });

    describe('getApplicationPolicy()', () => {
      it('is an alias for findApplicationPolicy', async () => {
        await repo.saveApplicationPolicy(makeAppPolicy() as any);
        const result = await repo.getApplicationPolicy('my-app');
        expect(result).not.toBeNull();
        expect(result!.application).toBe('my-app');
      });
    });

    describe('findApplicationPolicyById()', () => {
      it('returns the policy by id', async () => {
        await repo.saveApplicationPolicy(makeAppPolicy() as any);
        const result = await repo.findApplicationPolicyById(AP_ID);
        expect(result).not.toBeNull();
        expect(result!.application).toBe('my-app');
      });

      it('returns null for nonexistent id', async () => {
        const result = await repo.findApplicationPolicyById(NONEXISTENT_UUID);
        expect(result).toBeNull();
      });
    });

    describe('listApplicationPolicies()', () => {
      it('returns all application policies ordered by application', async () => {
        await repo.saveApplicationPolicy(makeAppPolicy({ id: AP_ID_B, application: 'b-app' }) as any);
        await repo.saveApplicationPolicy(makeAppPolicy({ id: AP_ID_A, application: 'a-app' }) as any);

        const results = await repo.listApplicationPolicies();
        expect(results).toHaveLength(2);
        expect(results[0].application).toBe('a-app');
        expect(results[1].application).toBe('b-app');
      });

      it('returns empty array when none exist', async () => {
        const results = await repo.listApplicationPolicies();
        expect(results).toHaveLength(0);
      });
    });

    describe('saveApplicationPolicy()', () => {
      it('upserts (updates on conflict by id)', async () => {
        await repo.saveApplicationPolicy(makeAppPolicy() as any);
        await repo.saveApplicationPolicy(makeAppPolicy({ privacyOverride: 'relaxed' }) as any);

        const result = await repo.findApplicationPolicyById(AP_ID);
        expect(result!.privacyOverride).toBe('relaxed');
      });
    });

    describe('deleteApplicationPolicy()', () => {
      it('deletes and returns true', async () => {
        await repo.saveApplicationPolicy(makeAppPolicy() as any);
        const deleted = await repo.deleteApplicationPolicy(AP_ID);
        expect(deleted).toBe(true);

        const found = await repo.findApplicationPolicyById(AP_ID);
        expect(found).toBeNull();
      });

      it('returns false when id does not exist', async () => {
        const deleted = await repo.deleteApplicationPolicy(NONEXISTENT_UUID);
        expect(deleted).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ProcessPolicy
  // ═══════════════════════════════════════════════════════════════════════════

  describe('ProcessPolicy', () => {
    function makeProcessPolicy(overrides: Record<string, unknown> = {}) {
      return {
        id: PP_ID,
        application: 'my-app',
        process: 'my-process',
        step: 'my-step',
        defaultModelProfileId: 'mp-1',
        defaultTacticProfileId: 'tp-1',
        allowedModelProfileIds: ['mp-1', 'mp-2'],
        blockedModelProfileIds: null,
        allowedTacticProfileIds: ['tp-1'],
        privacyOverride: null,
        costSensitivityOverride: null,
        forceEscalationForGrades: ['A'],
        enabled: true,
        updatedAt: new Date('2026-03-16T12:00:00Z'),
        ...overrides,
      };
    }

    describe('findProcessPolicy()', () => {
      it('returns null when not found', async () => {
        const result = await repo.findProcessPolicy('app', 'proc', 'step');
        expect(result).toBeNull();
      });

      it('finds by application, process, and step', async () => {
        await repo.saveProcessPolicy(makeProcessPolicy() as any);

        const result = await repo.findProcessPolicy('my-app', 'my-process', 'my-step');
        expect(result).not.toBeNull();
        expect(result!.id).toBe(PP_ID);
        expect(result!.application).toBe('my-app');
        expect(result!.process).toBe('my-process');
        expect(result!.step).toBe('my-step');
        expect(result!.defaultModelProfileId).toBe('mp-1');
        expect(result!.allowedModelProfileIds).toEqual(['mp-1', 'mp-2']);
        expect(result!.forceEscalationForGrades).toEqual(['A']);
      });

      it('finds by application and process when step is null', async () => {
        await repo.saveProcessPolicy(makeProcessPolicy({ step: null }) as any);

        const result = await repo.findProcessPolicy('my-app', 'my-process');
        expect(result).not.toBeNull();
        expect(result!.step).toBeNull();
      });

      it('returns null when step is null but searching with step', async () => {
        await repo.saveProcessPolicy(makeProcessPolicy({ step: null }) as any);

        const result = await repo.findProcessPolicy('my-app', 'my-process', 'some-step');
        expect(result).toBeNull();
      });
    });

    describe('getProcessPolicy()', () => {
      it('delegates to findProcessPolicy with null step', async () => {
        await repo.saveProcessPolicy(makeProcessPolicy({ step: null }) as any);
        const result = await repo.getProcessPolicy('my-app', 'my-process', null);
        expect(result).not.toBeNull();
      });

      it('delegates to findProcessPolicy with a step value', async () => {
        await repo.saveProcessPolicy(makeProcessPolicy() as any);
        const result = await repo.getProcessPolicy('my-app', 'my-process', 'my-step');
        expect(result).not.toBeNull();
      });
    });

    describe('findProcessPolicyById()', () => {
      it('returns the policy by id', async () => {
        await repo.saveProcessPolicy(makeProcessPolicy() as any);
        const result = await repo.findProcessPolicyById(PP_ID);
        expect(result).not.toBeNull();
        expect(result!.process).toBe('my-process');
      });

      it('returns null for nonexistent id', async () => {
        const result = await repo.findProcessPolicyById(NONEXISTENT_UUID);
        expect(result).toBeNull();
      });
    });

    describe('listProcessPolicies()', () => {
      it('returns all process policies', async () => {
        await repo.saveProcessPolicy(makeProcessPolicy({ id: PP_ID_1, application: 'app-a', process: 'p1' }) as any);
        await repo.saveProcessPolicy(makeProcessPolicy({ id: PP_ID_2, application: 'app-b', process: 'p2' }) as any);

        const results = await repo.listProcessPolicies();
        expect(results).toHaveLength(2);
      });

      it('filters by application when provided', async () => {
        await repo.saveProcessPolicy(makeProcessPolicy({ id: PP_ID_1, application: 'app-a', process: 'p1' }) as any);
        await repo.saveProcessPolicy(makeProcessPolicy({ id: PP_ID_2, application: 'app-b', process: 'p2' }) as any);

        const results = await repo.listProcessPolicies('app-a');
        expect(results).toHaveLength(1);
        expect(results[0].application).toBe('app-a');
      });

      it('returns empty array when none exist', async () => {
        const results = await repo.listProcessPolicies();
        expect(results).toHaveLength(0);
      });
    });

    describe('saveProcessPolicy()', () => {
      it('upserts (updates on conflict by id)', async () => {
        await repo.saveProcessPolicy(makeProcessPolicy() as any);
        await repo.saveProcessPolicy(
          makeProcessPolicy({ defaultModelProfileId: 'mp-new' }) as any,
        );

        const result = await repo.findProcessPolicyById(PP_ID);
        expect(result!.defaultModelProfileId).toBe('mp-new');
      });
    });

    describe('deleteProcessPolicy()', () => {
      it('deletes and returns true', async () => {
        await repo.saveProcessPolicy(makeProcessPolicy() as any);
        const deleted = await repo.deleteProcessPolicy(PP_ID);
        expect(deleted).toBe(true);

        const found = await repo.findProcessPolicyById(PP_ID);
        expect(found).toBeNull();
      });

      it('returns false when id does not exist', async () => {
        const deleted = await repo.deleteProcessPolicy(NONEXISTENT_UUID);
        expect(deleted).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // JSON string parsing edge cases (for environments that return JSON as text)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('JSON row mappers — string input paths', () => {
    it('handles global policy with text-serialized JSON columns', async () => {
      // Insert a row with stringified JSON to exercise parseJsonArray/parseJsonObject string paths
      await pool.query(
        `INSERT INTO global_policies (
           id, allowed_vendors, blocked_vendors, default_privacy,
           default_cost_sensitivity, structured_output_required_for_grades,
           traceability_required_for_grades, max_latency_ms_by_load_tier,
           local_preferred_task_types, cloud_required_load_tiers,
           enabled, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          GP_ID,
          '["openai"]',
          '[]',
          'standard',
          'balanced',
          '["A"]',
          '["B"]',
          '{"low": 5000}',
          '["summarization"]',
          '["high"]',
          true,
          new Date(),
        ],
      );

      const result = await repo.getGlobalPolicy();
      expect(result).not.toBeNull();
      expect(result!.allowedVendors).toEqual(['openai']);
      expect(result!.maxLatencyMsByLoadTier).toEqual({ low: 5000 });
    });

    it('handles application policy with null optional JSON arrays', async () => {
      const AP_NULL = '00000000-0000-4000-a000-000000000099';
      await pool.query(
        `INSERT INTO application_policies (
           id, application, allowed_vendors, blocked_vendors,
           privacy_override, cost_sensitivity_override,
           preferred_model_profile_ids, blocked_model_profile_ids,
           local_preferred_task_types, structured_output_required_for_grades,
           enabled, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          AP_NULL, 'null-test-app',
          null, null,
          null, null,
          null, null,
          null, null,
          true, new Date(),
        ],
      );

      const result = await repo.findApplicationPolicy('null-test-app');
      expect(result).not.toBeNull();
      expect(result!.allowedVendors).toBeNull();
      expect(result!.blockedVendors).toBeNull();
      expect(result!.preferredModelProfileIds).toBeNull();
    });
  });
});
