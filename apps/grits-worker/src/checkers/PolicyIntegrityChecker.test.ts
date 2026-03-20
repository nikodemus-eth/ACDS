import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PolicyIntegrityChecker } from './PolicyIntegrityChecker.js';
import { PgProviderRepository, PgPolicyRepository } from '@acds/persistence-pg';
import { ProviderVendor, AuthType } from '@acds/core-types';
import { createTestPool, runMigrations, closePool, truncateAll, type PoolLike } from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;
let providerRepo: PgProviderRepository;
let policyRepo: PgPolicyRepository;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
  providerRepo = new PgProviderRepository(pool as any);
  policyRepo = new PgPolicyRepository(pool as any);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

async function seedProvider(vendor: string, enabled = true) {
  await pool.query(
    `INSERT INTO providers (id, name, vendor, auth_type, base_url, enabled, environment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [crypto.randomUUID(), `${vendor} Provider`, vendor, AuthType.API_KEY, 'https://api.test.com', enabled, 'cloud'],
  );
}

async function seedApplicationPolicy(application: string, options: {
  allowedVendors?: string[];
  blockedVendors?: string[];
} = {}) {
  await pool.query(
    `INSERT INTO application_policies (id, application, allowed_vendors, blocked_vendors, enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      crypto.randomUUID(),
      application,
      JSON.stringify(options.allowedVendors ?? []),
      JSON.stringify(options.blockedVendors ?? []),
      true,
      new Date(),
    ],
  );
}

describe('PolicyIntegrityChecker', () => {
  it('has correct metadata', () => {
    const checker = new PolicyIntegrityChecker(policyRepo, providerRepo);
    expect(checker.name).toBe('PolicyIntegrityChecker');
    expect(checker.invariantIds).toEqual(['INV-001']);
    expect(checker.supportedCadences).toContain('daily');
    expect(checker.supportedCadences).toContain('release');
  });

  it('passes when no policies exist', async () => {
    const checker = new PolicyIntegrityChecker(policyRepo, providerRepo);
    const result = await checker.check('daily');
    expect(result.invariants).toHaveLength(1);
    expect(result.invariants[0].status).toBe('pass');
  });

  it('passes when application policy has no conflicts', async () => {
    await seedProvider(ProviderVendor.OPENAI);
    await seedApplicationPolicy('my-app', {
      allowedVendors: [ProviderVendor.OPENAI],
      blockedVendors: [ProviderVendor.LMSTUDIO],
    });
    const checker = new PolicyIntegrityChecker(policyRepo, providerRepo);
    const result = await checker.check('daily');
    const inv = result.invariants[0];
    // May warn about lmstudio having no enabled providers, but no critical/high failures
    const criticalOrHigh = inv.defects.filter(d => d.severity === 'critical' || d.severity === 'high');
    expect(criticalOrHigh).toHaveLength(0);
  });

  it('warns when vendor appears in both allowed and blocked', async () => {
    await seedProvider(ProviderVendor.OPENAI);
    await seedApplicationPolicy('conflicted-app', {
      allowedVendors: [ProviderVendor.OPENAI],
      blockedVendors: [ProviderVendor.OPENAI],
    });
    const checker = new PolicyIntegrityChecker(policyRepo, providerRepo);
    const result = await checker.check('daily');
    const inv = result.invariants[0];
    expect(inv.defects.some(d => d.title.includes('both allowed and blocked'))).toBe(true);
  });

  it('warns when allowedVendors is empty', async () => {
    await seedApplicationPolicy('empty-app', { allowedVendors: [] });
    const checker = new PolicyIntegrityChecker(policyRepo, providerRepo);
    const result = await checker.check('daily');
    const inv = result.invariants[0];
    expect(inv.defects.some(d => d.title.includes('Empty allowedVendors'))).toBe(true);
  });

  it('warns when allowed vendor has no enabled providers', async () => {
    await seedApplicationPolicy('no-providers-app', {
      allowedVendors: ['nonexistent_vendor'],
    });
    const checker = new PolicyIntegrityChecker(policyRepo, providerRepo);
    const result = await checker.check('daily');
    const inv = result.invariants[0];
    expect(inv.defects.some(d => d.title.includes('no enabled providers'))).toBe(true);
  });

  it('uses correct cadence in result', async () => {
    const checker = new PolicyIntegrityChecker(policyRepo, providerRepo);
    const result = await checker.check('release');
    expect(result.cadence).toBe('release');
    expect(result.checkerName).toBe('PolicyIntegrityChecker');
  });
});
